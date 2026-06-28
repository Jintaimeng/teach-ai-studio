import https from "node:https";

/**
 * yanbot MCP 客户端
 *
 * 对接 yanbot 公开 MCP 服务（https://api.yanbot.tech/mcp，JSON-RPC over HTTP，无需鉴权）。
 * 移植自 skills/yanbot-skill/server.js 的无状态 MCP 会话实现：
 *   initialize → 拿 mcp-session-id → notifications/initialized → tools/call
 *
 * 资讯（query_feeds）与资讯聚合（aggregate_feeds）数据由此模块提供，
 * 与现有 yanbotClient.ts（HMAC 开放接口，仅 school-score）相互独立。
 */

const MCP_HOST = process.env.YANBOT_MCP_HOST || "api.yanbot.tech";
const MCP_PATH = process.env.YANBOT_MCP_PATH || "/mcp";
const MAX_RETRY = 5;
const REQUEST_TIMEOUT_MS = 20000;

let mcpReady = false;
let sessionId: string | null = null;
let connectPromise: Promise<void> | null = null;

interface RpcResponse {
  jsonrpc?: string;
  id?: number;
  result?: any;
  error?: { code?: number; message?: string };
}

function mcpPost(body: unknown, sid?: string | null): Promise<{ rpc: RpcResponse | null; sessionId: string | null }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "Content-Length": String(Buffer.byteLength(data)),
    };
    if (sid) headers["mcp-session-id"] = sid;

    const req = https.request(
      { hostname: MCP_HOST, path: MCP_PATH, method: "POST", headers, timeout: REQUEST_TIMEOUT_MS },
      (res) => {
        const newSid = (res.headers["mcp-session-id"] as string | undefined) || undefined;
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          buf += c;
        });
        res.on("end", () => {
          let rpc: RpcResponse | null = null;
          // 响应可能是纯 JSON，也可能是 SSE（data: {...}）
          const trimmed = buf.trim();
          if (trimmed.startsWith("{")) {
            try {
              rpc = JSON.parse(trimmed);
            } catch {
              /* ignore */
            }
          }
          if (!rpc) {
            for (const line of buf.split("\n")) {
              if (line.startsWith("data: ")) {
                try {
                  rpc = JSON.parse(line.slice(6));
                } catch {
                  /* ignore */
                }
              }
            }
          }
          resolve({ rpc, sessionId: newSid || sid || null });
        });
        res.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new Error("yanbot MCP 请求超时")));
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function connectMcp(): Promise<void> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      const { rpc, sessionId: sid } = await mcpPost({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "teach-ai-studio-promo", version: "1.0" },
        },
      });
      if (!sid || rpc?.error) {
        throw new Error(rpc?.error?.message || "yanbot MCP 未返回会话 ID");
      }
      sessionId = sid;
      // 发送 initialized 通知（无响应）
      await mcpPost({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }, sessionId);
      mcpReady = true;
      console.log("[yanbotMcp] MCP 会话就绪:", sessionId);
      return;
    } catch (err) {
      lastErr = err;
      console.error(`[yanbotMcp] 连接失败 (第 ${attempt}/${MAX_RETRY} 次):`, (err as Error)?.message || err);
    }
  }
  mcpReady = false;
  sessionId = null;
  throw new Error(`无法连接 yanbot MCP 服务：${(lastErr as Error)?.message || lastErr}`);
}

/** 懒初始化会话（并发去重） */
export async function ensureMcpReady(): Promise<void> {
  if (mcpReady && sessionId) return;
  if (!connectPromise) {
    connectPromise = connectMcp().finally(() => {
      connectPromise = null;
    });
  }
  await connectPromise;
}

/** 调用 MCP 工具，解析 result.content[0].text 为 JSON */
export async function callTool<T = any>(tool: string, args?: Record<string, unknown>): Promise<T> {
  await ensureMcpReady();
  const rpcId = Math.floor((Date.now() % 1e9) + Math.floor(performance.now())) % 1e9;
  try {
    const { rpc } = await mcpPost(
      { jsonrpc: "2.0", id: rpcId, method: "tools/call", params: { name: tool, arguments: args || {} } },
      sessionId
    );
    if (!rpc) throw new Error("yanbot MCP 返回为空");
    if (rpc.error) throw new Error(rpc.error.message || JSON.stringify(rpc.error));
    const text = rpc.result?.content?.[0]?.text;
    if (typeof text !== "string") return (rpc.result ?? null) as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return { raw: text } as unknown as T;
    }
  } catch (err) {
    // 会话可能过期，重置以便下次重连
    mcpReady = false;
    sessionId = null;
    throw err;
  }
}

export interface FeedItem {
  _id: string;
  title?: string;
  link?: string;
  isoDate?: string;
  tags?: string[];
  feedMeta?: { title?: string };
  content?: string;
  contentSnippet?: string;
  summary?: string;
  [key: string]: unknown;
}

export interface FeedList {
  list: FeedItem[];
  pagination?: { page: number; pageSize: number; total: number; totalPages: number };
}

const DEFAULT_FEED_FIELDS = ["_id", "title", "link", "isoDate", "tags", "feedMeta"];

/** 查询资讯列表 */
export function queryFeeds(params: {
  keyword?: string;
  page?: number;
  pageSize?: number;
  fields?: string[];
  taskIds?: string[];
} = {}): Promise<FeedList> {
  const args: Record<string, unknown> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    fields: params.fields ?? DEFAULT_FEED_FIELDS,
  };
  if (params.keyword) args.keyword = params.keyword;
  if (params.taskIds && params.taskIds.length) args.taskIds = params.taskIds;
  return callTool<FeedList>("query_feeds", args);
}

/** 资讯聚合统计 */
export function aggregateFeeds(params: Record<string, unknown> = {}): Promise<any> {
  return callTool("aggregate_feeds", params);
}

// ============= 考研院校专业历年录取数据 =============

export interface SchoolScoreRecord {
  _id?: string;
  year?: number;
  schoolCode?: string;
  schoolName?: string;
  provinceName?: string;
  level?: string;
  subjectCode?: string;
  subjectName?: string;
  college?: string;
  studyForm?: string;
  applicants?: number | string;
  firstChoiceAdmissions?: number;
  adjustedAdmissions?: number;
  lowestScore?: number;
  averageScore?: number;
  highestScore?: number;
  remarks?: string;
  [key: string]: unknown;
}

export interface SchoolScoreList {
  list: SchoolScoreRecord[];
  pagination?: { page: number; pageSize: number; total: number; totalPages: number };
}

/** 查询院校专业历年录取分数线 */
export function querySchoolScores(params: {
  schoolName?: string;
  subjectName?: string;
  subjectCode?: string;
  year?: number;
  level?: string;
  studyForm?: string;
  minLowestScore?: number;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
} = {}): Promise<SchoolScoreList> {
  const args: Record<string, unknown> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    sortBy: params.sortBy ?? "lowestScore",
    sortOrder: params.sortOrder ?? "desc",
  };
  if (params.schoolName) args.schoolName = params.schoolName;
  if (params.subjectName) args.subjectName = params.subjectName;
  if (params.subjectCode) args.subjectCode = params.subjectCode;
  if (typeof params.year === "number") args.year = params.year;
  if (params.level) args.level = params.level;
  if (params.studyForm) args.studyForm = params.studyForm;
  if (typeof params.minLowestScore === "number") args.minLowestScore = params.minLowestScore;
  return callTool<SchoolScoreList>("query_school_scores", args);
}

/** 可用年份（降序） */
export async function listScoreYears(): Promise<number[]> {
  const r = await callTool<{ years?: number[] }>("list_score_years", {});
  return r?.years || [];
}

/** 院校层次枚举 */
export async function listScoreLevels(): Promise<string[]> {
  const r = await callTool<{ levels?: string[] }>("list_score_levels", {});
  return r?.levels || [];
}

/**
 * 按 id 取资讯完整内容（用于喂模型）。
 * 优先拉取一批带正文字段的资讯，再按 _id 过滤；保持入参顺序。
 */
export async function getFeedsByIds(ids: string[]): Promise<FeedItem[]> {
  const wanted = new Set(ids);
  if (wanted.size === 0) return [];
  const collected = new Map<string, FeedItem>();
  const fields = ["_id", "title", "link", "isoDate", "tags", "feedMeta", "content", "contentSnippet", "summary"];

  // 翻页查询直到覆盖目标 id 或达到上限
  const MAX_PAGES = 10;
  const pageSize = 50;
  for (let page = 1; page <= MAX_PAGES && collected.size < wanted.size; page++) {
    let res: FeedList;
    try {
      res = await queryFeeds({ page, pageSize, fields });
    } catch (err) {
      console.error("[yanbotMcp] getFeedsByIds 查询失败:", (err as Error)?.message || err);
      break;
    }
    const list = res?.list || [];
    for (const item of list) {
      if (item?._id && wanted.has(item._id)) collected.set(item._id, item);
    }
    const totalPages = res?.pagination?.totalPages;
    if (!list.length || (typeof totalPages === "number" && page >= totalPages)) break;
  }

  return ids.map((id) => collected.get(id)).filter(Boolean) as FeedItem[];
}
