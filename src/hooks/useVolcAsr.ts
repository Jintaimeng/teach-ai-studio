import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 火山引擎大模型流式语音识别（经本地 /api/asr WebSocket 代理）。
 *
 * 流程：getUserMedia → AudioContext(16k) + AudioWorklet 取 16bit PCM →
 *       WS 二进制上行 → 服务端转火山双向流式 ASR → partial/final 文本回推。
 *
 * 相比浏览器 Web Speech API：走国内 bytedance 节点，低延迟、真正边说边出字。
 * 接口与 useLiveSpeech 保持一致：{ supported, listening, transcript, start, stop, reset, error }。
 */
export function useVolcAsr() {
  const supported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== 'undefined' &&
    typeof (window.AudioContext || (window as any).webkitAudioContext) !== 'undefined' &&
    'WebSocket' in window;

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startingRef = useRef(false);

  // 仅停止麦克风采集（保留 WS 以接收最终结果）
  const teardownCapture = useCallback(() => {
    try {
      nodeRef.current?.disconnect();
    } catch {
      /* noop */
    }
    nodeRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (ctxRef.current && ctxRef.current.state !== 'closed') {
      ctxRef.current.close().catch(() => undefined);
    }
    ctxRef.current = null;
  }, []);

  const closeWs = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (!ws) return;
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.close();
      } catch {
        /* noop */
      }
    } else if (ws.readyState === WebSocket.CONNECTING) {
      // 还在握手就关闭会触发 "closed before the connection is established" 误报。
      // 摘掉会误报的 onerror，等连上后再优雅关闭。
      ws.onerror = null;
      ws.onmessage = null;
      ws.onopen = () => {
        try {
          ws.close();
        } catch {
          /* noop */
        }
      };
    }
  }, []);

  const start = useCallback(async () => {
    if (!supported || listening || startingRef.current) return;
    startingRef.current = true;
    setError('');
    try {
      // 先发起 WS 连接（与麦克风/worklet 初始化并行），尽早完成握手，避免短按时还在 CONNECTING
      // 开发期 Vite 的 WS 代理在本机不稳定（upgrade 挂起），直连后端端口；生产走同源由反代转发。
      // 可用 VITE_ASR_WS_URL 完整覆盖，或 VITE_ASR_WS_PORT 指定后端端口（默认 3000）。
      const wsUrl =
        (import.meta as any).env?.VITE_ASR_WS_URL ||
        ((import.meta as any).env?.DEV
          ? `ws://${location.hostname}:${(import.meta as any).env?.VITE_ASR_WS_PORT || '3000'}/api/asr`
          : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/asr`);
      console.log(`[ASR] 连接 ${wsUrl}`);
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;
      let sentChunks = 0;
      let sentBytes = 0;
      ws.onopen = () => console.log('[ASR] WS 已连接，开始上行音频');
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          if (msg.type === 'partial' || msg.type === 'final') {
            console.log(`[ASR] 收到${msg.type}: ${JSON.stringify((msg.text || '').slice(0, 60))}`);
            setTranscript(msg.text || '');
          } else if (msg.type === 'error') {
            console.error(`[ASR] 服务端报错: ${msg.message}`);
            setError(msg.message || '语音识别错误');
          }
        } catch {
          /* 忽略 */
        }
      };
      ws.onerror = () => {
        console.error('[ASR] WS onerror');
        setError('语音连接错误');
      };
      ws.onclose = (ev) => {
        console.log(`[ASR] WS 关闭 code=${ev.code}（共上行 ${sentChunks} 包/${sentBytes}B）`);
        setListening(false);
        startingRef.current = false;
      };

      console.log('[ASR] 请求麦克风…');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      console.log('[ASR] 麦克风已授权');

      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new Ctx({ sampleRate: 16000 });
      ctxRef.current = ctx;
      await ctx.audioWorklet.addModule('/asr-worklet.js');
      console.log(`[ASR] AudioWorklet 已加载，采样率=${ctx.sampleRate}`);

      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, 'pcm-worklet');
      nodeRef.current = node;
      node.port.onmessage = (e: MessageEvent) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const buf = e.data as ArrayBuffer;
          sentChunks += 1;
          sentBytes += buf.byteLength;
          if (sentChunks === 1 || sentChunks % 50 === 0) {
            console.log(`[ASR] 上行音频包 ${sentChunks}（累计 ${sentBytes}B）`);
          }
          wsRef.current.send(buf);
        }
      };
      // 接入静音 sink，确保 worklet 在图中被驱动且不产生回声
      const sink = ctx.createGain();
      sink.gain.value = 0;
      source.connect(node);
      node.connect(sink);
      sink.connect(ctx.destination);

      setListening(true);
    } catch (e: any) {
      setError(`麦克风/语音初始化失败：${e?.message || e}`);
      teardownCapture();
      closeWs();
    } finally {
      startingRef.current = false;
    }
  }, [supported, listening, teardownCapture, closeWs]);

  const stop = useCallback(() => {
    setListening(false);
    teardownCapture();
    // 通知服务端结束，等最终结果回来后由 onclose 收尾；兜底 2.5s 强制关闭
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('[ASR] stop：发送 end，等待最终结果');
      try {
        ws.send(JSON.stringify({ type: 'end' }));
      } catch {
        /* noop */
      }
      window.setTimeout(() => closeWs(), 2500);
    } else {
      console.log(`[ASR] stop：WS 未就绪(readyState=${ws?.readyState ?? 'none'})，直接收尾`);
      closeWs();
    }
  }, [teardownCapture, closeWs]);

  const reset = useCallback(() => setTranscript(''), []);

  // 卸载清理
  useEffect(() => {
    return () => {
      teardownCapture();
      closeWs();
    };
  }, [teardownCapture, closeWs]);

  return { supported, listening, transcript, start, stop, reset, error };
}
