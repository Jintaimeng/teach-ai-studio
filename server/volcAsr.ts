import { WebSocket } from "ws";
import zlib from "node:zlib";
import { randomUUID } from "node:crypto";

/**
 * 火山引擎 大模型流式语音识别（SAUC bigmodel，双向流式）协议封装。
 * 协议对齐官方 Python demo（sauc_python/sauc_websocket_demo.py）：
 *  - WebSocket 握手头携带 AppKey / AccessKey / ResourceId
 *  - 二进制帧：4 字节头 + int32 seq + uint32 size + gzip(payload)
 *  - full client request(JSON 配置) → 多个 audio only request(PCM 分包) → 末包负序号结束
 *  - 服务端返回 gzip(JSON)，result.text 为累计识别文本
 */

const PROTO_V1 = 0b0001;
const MT_FULL = 0b0001;
const MT_AUDIO = 0b0010;
const MT_SERVER_FULL = 0b1001;
const MT_SERVER_ERR = 0b1111;
const FLAG_POS = 0b0001; // POS_SEQUENCE
const FLAG_NEG_WITH_SEQ = 0b0011; // NEG_WITH_SEQUENCE（末包）
const SER_JSON = 0b0001;
const COMP_GZIP = 0b0001;

function header(messageType: number, flags: number): Buffer {
  return Buffer.from([
    (PROTO_V1 << 4) | 1, // 版本 + header_size(1)
    (messageType << 4) | flags,
    (SER_JSON << 4) | COMP_GZIP,
    0x00, // reserved
  ]);
}

function buildFullClientRequest(seq: number): Buffer {
  const payload = {
    user: { uid: "teach-ai" },
    audio: { format: "pcm", rate: 16000, bits: 16, channel: 1 },
    request: {
      model_name: "bigmodel",
      enable_itn: true, // 数字规整
      enable_punc: true, // 自动标点
      enable_ddc: true, // 语义顺滑
      show_utterances: true,
      enable_nonstream: false, // 双向流式
    },
  };
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));
  const seqBuf = Buffer.alloc(4);
  seqBuf.writeInt32BE(seq);
  const sizeBuf = Buffer.alloc(4);
  sizeBuf.writeUInt32BE(gz.length);
  return Buffer.concat([header(MT_FULL, FLAG_POS), seqBuf, sizeBuf, gz]);
}

function buildAudioRequest(seq: number, segment: Buffer, isLast: boolean): Buffer {
  const flags = isLast ? FLAG_NEG_WITH_SEQ : FLAG_POS;
  const seqVal = isLast ? -seq : seq;
  const gz = zlib.gzipSync(segment);
  const seqBuf = Buffer.alloc(4);
  seqBuf.writeInt32BE(seqVal);
  const sizeBuf = Buffer.alloc(4);
  sizeBuf.writeUInt32BE(gz.length);
  return Buffer.concat([header(MT_AUDIO, flags), seqBuf, sizeBuf, gz]);
}

interface ParsedResp {
  code: number;
  isLast: boolean;
  payload: any;
}

function parseResponse(msg: Buffer): ParsedResp {
  const headerSize = msg[0] & 0x0f;
  const messageType = msg[1] >> 4;
  const flags = msg[1] & 0x0f;
  const compression = msg[2] & 0x0f;

  let offset = headerSize * 4;
  let isLast = false;
  let code = 0;

  if (flags & 0x01) offset += 4; // payload_sequence
  if (flags & 0x02) isLast = true;
  if (flags & 0x04) offset += 4; // event

  if (messageType === MT_SERVER_FULL) {
    offset += 4; // payload_size
  } else if (messageType === MT_SERVER_ERR) {
    code = msg.readInt32BE(offset);
    offset += 8; // code(4) + size(4)
  }

  let payload: any = null;
  const body = msg.subarray(offset);
  if (body && body.length) {
    let data: Buffer = body;
    if (compression === COMP_GZIP) {
      try {
        data = zlib.gunzipSync(body);
      } catch {
        /* 解压失败则忽略 */
      }
    }
    try {
      payload = JSON.parse(data.toString("utf8"));
    } catch {
      /* 非 JSON 忽略 */
    }
  }
  return { code, isLast, payload };
}

export interface VolcAsrSession {
  /** 推送一段 16k/16bit/mono 原始 PCM */
  sendAudio(pcm: Buffer): void;
  /** 结束本次识别（发送末包，稍后关闭连接） */
  end(): void;
}

export function isVolcAsrConfigured(): boolean {
  // 新版控制台：单一 X-Api-Key；旧版控制台：App-Key + Access-Key
  return Boolean(process.env.VOLC_ASR_API_KEY || process.env.VOLC_ASR_ACCESS_KEY);
}

export function createVolcAsrSession(handlers: {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError: (message: string) => void;
  onClose: () => void;
}): VolcAsrSession {
  const appKey = process.env.VOLC_ASR_APP_KEY; // 旧版控制台 X-Api-App-Key（APP ID）
  const accessKey = process.env.VOLC_ASR_ACCESS_KEY; // 旧版控制台 X-Api-Access-Key（Access Token）
  const apiKey = process.env.VOLC_ASR_API_KEY; // 新版控制台 X-Api-Key（单一密钥）
  const url = process.env.VOLC_ASR_URL || "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel";
  const resourceId = process.env.VOLC_ASR_RESOURCE_ID || "volc.bigasr.sauc.duration";

  if (!apiKey && !accessKey) {
    handlers.onError("未配置火山语音识别凭据：新版控制台设 VOLC_ASR_API_KEY；旧版控制台设 VOLC_ASR_APP_KEY + VOLC_ASR_ACCESS_KEY");
    handlers.onClose();
    return { sendAudio() {}, end() {} };
  }

  let seq = 1;
  let ready = false;
  let ended = false;
  const queue: Buffer[] = []; // ready 之前缓存的音频

  const headers: Record<string, string> = {
    "X-Api-Resource-Id": resourceId,
    "X-Api-Request-Id": randomUUID(),
    "X-Api-Connect-Id": randomUUID(),
  };
  // 凭据优先级：SAUC bigmodel 端点认 App-Key + Access-Key（官方 demo 即此套），优先使用；
  // 仅在缺少它们时才回退到单一 X-Api-Key，避免混发导致 400。
  let credScheme: string;
  if (appKey && accessKey) {
    headers["X-Api-App-Key"] = appKey;
    headers["X-Api-Access-Key"] = accessKey;
    credScheme = "App-Key+Access-Key";
  } else if (apiKey) {
    headers["X-Api-Key"] = apiKey;
    credScheme = "X-Api-Key";
  } else {
    if (appKey) headers["X-Api-App-Key"] = appKey;
    if (accessKey) headers["X-Api-Access-Key"] = accessKey;
    credScheme = "不完整凭据";
  }

  console.log(`[ASR] 连接火山 url=${url} resourceId=${resourceId} 凭据=${credScheme}`);

  const ws = new WebSocket(url, { headers });

  // 记录 logid 便于排错
  ws.on("upgrade", (res: any) => {
    const logid = res?.headers?.["x-tt-logid"];
    if (logid) console.log(`[ASR] 火山连接 X-Tt-Logid=${logid}`);
  });

  // 握手被拒（非 101，如 400/401/403）：读出响应体与 logid，给出可定位的原因
  ws.on("unexpected-response", (_req: any, res: any) => {
    const logid = res?.headers?.["x-tt-logid"] || res?.headers?.["X-Tt-Logid"];
    const chunks: Buffer[] = [];
    res.on("data", (c: Buffer) => chunks.push(c));
    res.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8").slice(0, 500);
      console.error(`[ASR] 火山握手被拒 status=${res.statusCode} X-Tt-Logid=${logid || "无"} body=${body || "(空)"}`);
      handlers.onError(`火山握手失败 ${res.statusCode}（凭据=${credScheme}）${body ? ": " + body : ""}`);
    });
  });

  const flushQueue = () => {
    while (queue.length) {
      const seg = queue.shift()!;
      ws.send(buildAudioRequest(seq, seg, false));
      seq += 1;
    }
  };

  ws.on("open", () => {
    console.log(`[ASR] 火山连接已建立，发送配置帧`);
    ws.send(buildFullClientRequest(seq));
    seq += 1;
  });

  ws.on("message", (data: Buffer) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as any);
    const resp = parseResponse(buf);
    if (resp.code && resp.code !== 0) {
      handlers.onError(`ASR 错误 code=${resp.code} ${JSON.stringify(resp.payload || {})}`);
      return;
    }
    // 首条响应为 full request 的 ack，标记 ready 并冲刷缓存音频
    if (!ready) {
      ready = true;
      console.log(`[ASR] 火山就绪(ack)，冲刷缓存音频 ${queue.length} 段`);
      flushQueue();
    }
    const text = resp.payload?.result?.text;
    if (typeof text === "string" && text.length) {
      handlers.onTranscript(text, resp.isLast);
    }
  });

  ws.on("error", (e: any) => {
    console.error(`[ASR] 火山连接错误: ${e?.message || e}`);
    handlers.onError(String(e?.message || e));
  });
  ws.on("close", (code: number, reason: Buffer) => {
    console.log(`[ASR] 火山连接关闭 code=${code} reason=${reason?.toString() || ""}`);
    handlers.onClose();
  });

  return {
    sendAudio(pcm: Buffer) {
      if (ended) return;
      if (ws.readyState !== WebSocket.OPEN || !ready) {
        queue.push(pcm);
        return;
      }
      ws.send(buildAudioRequest(seq, pcm, false));
      seq += 1;
    },
    end() {
      if (ended) return;
      ended = true;
      try {
        if (ws.readyState === WebSocket.OPEN) {
          // 末包：空 PCM + 负序号，通知服务端结束
          ws.send(buildAudioRequest(seq, Buffer.alloc(0), true));
        }
      } catch {
        /* noop */
      }
      // 留一点时间接收最终结果再关闭
      setTimeout(() => {
        try {
          ws.close();
        } catch {
          /* noop */
        }
      }, 1500);
    },
  };
}
