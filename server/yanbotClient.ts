import crypto from "node:crypto";

/**
 * yanbot 开放接口客户端
 *
 * 对接 https://yanbot.tech/open/school-score/*（考研院校专业历年录取分数）。
 * 鉴权与 yanbot 后端一致（见 yanbot 项目 src/modules/open-api/middlewares/auth.ts）：
 *   signature = HMAC-SHA256(apiKey + timestamp + nonce, apiSecret)  // 小写 hex
 * 请求头：x-api-key / x-timestamp(ms) / x-nonce(uuid) / x-signature
 *
 * 凭据与基址从环境变量读取：
 *   YANBOT_OPEN_BASE_URL（默认 https://yanbot.tech）
 *   OPEN_API_KEY / OPEN_API_SECRET
 */

const DEFAULT_TIMEOUT_MS = 15000;

export interface SchoolScoreRecord {
  _id?: string;
  year: number;
  schoolCode: string;
  schoolName: string;
  schoolCodeName?: string;
  provinceCode?: string;
  provinceName?: string;
  provinceCodeName?: string;
  level?: string;
  subjectCode: string;
  subjectName: string;
  subjectCodeName?: string;
  college?: string;
  studyForm?: string;
  applicants?: number | string;
  firstChoiceAdmissions?: number;
  adjustedAdmissions?: number;
  lowestScore?: number;
  averageScore?: number;
  highestScore?: number;
  adjustedLowestScore?: number;
  adjustedAverageScore?: number;
  adjustedHighestScore?: number;
  remarks?: string;
  adjustedRemarks?: string;
  totalAdmissions?: number;
  school?: {
    name?: string;
    schoolCode?: string;
    is985?: boolean;
    is211?: boolean;
    isDual_class?: string | boolean;
    level?: string;
    type?: string;
    rank?: number;
  };
}

export interface SchoolScoreList {
  list: SchoolScoreRecord[];
  pagination?: { page: number; pageSize: number; total: number; totalPages: number };
  appliedFilters?: Record<string, unknown>;
  ignored?: string[];
}

export class YanbotApiError extends Error {
  statusCode: number;
  code?: number;
  constructor(message: string, statusCode: number, code?: number) {
    super(message);
    this.name = "YanbotApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function isYanbotConfigured(): boolean {
  return Boolean(process.env.OPEN_API_KEY && process.env.OPEN_API_SECRET);
}

function getConfig() {
  const baseUrl = (process.env.YANBOT_OPEN_BASE_URL || "https://yanbot.tech").replace(/\/+$/, "");
  const apiKey = process.env.OPEN_API_KEY;
  const apiSecret = process.env.OPEN_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new YanbotApiError(
      "未配置 yanbot 开放接口凭据：请在 .env 设置 OPEN_API_KEY 与 OPEN_API_SECRET",
      500
    );
  }
  return { baseUrl, apiKey, apiSecret };
}

function buildSignature(apiKey: string, timestamp: string, nonce: string, apiSecret: string): string {
  const signStr = `${apiKey}${timestamp}${nonce}`;
  return crypto.createHmac("sha256", apiSecret).update(signStr).digest("hex");
}

function buildAuthHeaders(apiKey: string, apiSecret: string): Record<string, string> {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();
  const signature = buildSignature(apiKey, timestamp, nonce, apiSecret);
  return {
    "x-api-key": apiKey,
    "x-timestamp": timestamp,
    "x-nonce": nonce,
    "x-signature": signature,
  };
}

interface YanbotEnvelope<T> {
  success: boolean;
  code: number;
  data?: T;
  message?: string;
}

async function get<T>(path: string, query?: Record<string, unknown>): Promise<T> {
  const { baseUrl, apiKey, apiSecret } = getConfig();

  const qs = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      qs.append(k, String(v));
    }
  }
  const url = `${baseUrl}${path}${qs.toString() ? `?${qs.toString()}` : ""}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: buildAuthHeaders(apiKey, apiSecret),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timer);
    throw new YanbotApiError(`请求 yanbot 失败：${err?.message || err}`, 0);
  }
  clearTimeout(timer);

  let body: YanbotEnvelope<T> | undefined;
  try {
    body = (await res.json()) as YanbotEnvelope<T>;
  } catch {
    body = undefined;
  }

  if (!res.ok || !body?.success) {
    throw new YanbotApiError(
      body?.message || `yanbot 开放接口请求失败 (HTTP ${res.status})`,
      res.status,
      body?.code
    );
  }

  return (body.data ?? (undefined as unknown)) as T;
}

/** 主查询：院校专业历年录取分数 */
export function querySchoolScore(
  params: Record<string, string | number | boolean | undefined>
): Promise<SchoolScoreList> {
  return get<SchoolScoreList>("/open/school-score/query", params);
}

/** 可用年份（降序） */
export async function getYears(): Promise<number[]> {
  const data = await get<{ years: number[] }>("/open/school-score/meta/years");
  return data?.years || [];
}

/** 院校层次枚举（双一流/211/985/...） */
export async function getLevels(year?: number): Promise<string[]> {
  const data = await get<{ levels: string[] }>("/open/school-score/meta/levels", { year });
  return data?.levels || [];
}
