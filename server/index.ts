import "dotenv/config";
import express from "express";
import { query, unstable_v2_createSession, unstable_v2_authenticate, PermissionResult, CanUseTool } from "@tencent-ai/agent-sdk";
import type { McpServerConfig, McpServerStatus, SlashCommand } from "@tencent-ai/agent-sdk";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import * as db from "./db.js";
import { requireAuth, handleRegister, handleLogin, handleMe } from "./auth.js";
import { generateVibeReport } from "./services/school-report.js";
import { generateTiaojiReport } from "./services/tiaoji-report.js";
import type { VibeReportInput } from "./services/report-types.js";
import {
  querySchoolScore,
  getYears,
  isYanbotConfigured,
  YanbotApiError,
  type SchoolScoreRecord,
} from "./yanbotClient.js";
import { WebSocketServer, type WebSocket } from "ws";
import { createVolcAsrSession, isVolcAsrConfigured } from "./volcAsr.js";
import {
  ensureMcpReady,
  queryFeeds,
  getFeedsByIds,
  querySchoolScores,
  listScoreYears,
  listScoreLevels,
  type FeedItem,
} from "./yanbotMcp.js";

const execAsync = promisify(exec);

// 待处理的权限请求
interface PendingPermission {
  resolve: (result: PermissionResult) => void;
  reject: (error: Error) => void;
  toolName: string;
  input: Record<string, unknown>;
  sessionId: string;
  timestamp: number;
}

const pendingPermissions = new Map<string, PendingPermission>();

// 权限请求超时时间（5分钟）
const PERMISSION_TIMEOUT = 5 * 60 * 1000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// ============= agent 并发护栏 =============
// 每次 query() 会 spawn 一个 CLI 子进程（约 30-50MB）。限制同时在跑的子进程数，
// 超限的请求排队等待，避免几十并发把内存打爆。
const AGENT_MAX_CONCURRENCY = Number(process.env.AGENT_MAX_CONCURRENCY) || 20;
let agentActive = 0;
const agentWaiters: Array<() => void> = [];

function acquireAgentSlot(): Promise<void> {
  if (agentActive < AGENT_MAX_CONCURRENCY) {
    agentActive++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    agentWaiters.push(() => {
      agentActive++;
      resolve();
    });
  });
}

function releaseAgentSlot(): void {
  agentActive = Math.max(0, agentActive - 1);
  const next = agentWaiters.shift();
  if (next) next();
}

function agentQueueDepth(): number {
  return agentWaiters.length;
}

// ============= 认证 API =============
app.post("/api/auth/register", handleRegister);
app.post("/api/auth/login", handleLogin);
app.get("/api/auth/me", requireAuth, handleMe);

// 缓存可用模型列表
let cachedModels: Array<{ modelId: string; name: string; description?: string }> = [];
const defaultModel = "auto";

type McpStatusValue = 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled' | string;

type McpServerConfigWithDisabled = McpServerConfig & {
  disabled?: boolean;
};

interface McpConfigFile {
  mcpServers?: Record<string, McpServerConfigWithDisabled>;
}

interface McpToolInfo {
  name: string;
}

interface McpServerInfo {
  name: string;
  type?: string;
  enabled: boolean;
  status: McpStatusValue;
  tools: McpToolInfo[];
}

interface McpInspectResult {
  status: McpServerStatus[];
  toolsByServer: Record<string, string[]>;
  inspectedAt: number;
}

const mcpConfigPath = process.env.MCP_CONFIG_PATH 
  ? path.resolve(process.env.MCP_CONFIG_PATH) 
  : path.resolve(process.cwd(), "mcp.json");

let rawMcpConfig: Record<string, McpServerConfigWithDisabled> = {};
let cachedMcpServers: Record<string, McpServerConfig> | undefined;
let lastMcpStatus: McpServerStatus[] = [];
let lastAvailableSkills: SlashCommand[] = [];
let cachedMcpInspect: McpInspectResult | null = null;

const MCP_INSPECT_CACHE_MS = 30_000;
const MCP_INSPECT_TIMEOUT_MS = 15_000;
const AUTH_VALIDATION_TIMEOUT_MS = 20_000;

function getSdkEnv(overrides: Record<string, string | undefined> = {}): Record<string, string> {
  return Object.fromEntries(
    Object.entries({
      CODEBUDDY_API_KEY: process.env.CODEBUDDY_API_KEY,
      CODEBUDDY_AUTH_TOKEN: process.env.CODEBUDDY_AUTH_TOKEN,
      CODEBUDDY_INTERNET_ENVIRONMENT: process.env.CODEBUDDY_INTERNET_ENVIRONMENT || 'external',
      CODEBUDDY_BASE_URL: process.env.CODEBUDDY_BASE_URL,
      ...overrides,
      SERVER__PORT: '0',
    }).filter(([, v]) => typeof v === 'string' && v.length > 0)
  ) as Record<string, string>;
}

function getAuthErrorMessage(error: any) {
  if (Array.isArray(error?.errors) && error.errors.length > 0) {
    return error.errors.join('\n');
  }
  return error?.message || String(error);
}

async function validateSdkAuth(env: Record<string, string>) {
  const abortController = new AbortController();
  const validationQuery = query({
    options: {
      cwd: process.cwd(),
      maxTurns: 1,
      permissionMode: 'bypassPermissions',
      env,
      abortController,
      stderr: (data: string) => {
        console.log(`[Auth validation stderr] ${data.trim()}`);
      },
    },
  });

  const timeout = setTimeout(() => {
    abortController.abort();
  }, AUTH_VALIDATION_TIMEOUT_MS);

  try {
    await validationQuery.accountInfo();
  } finally {
    clearTimeout(timeout);
    await validationQuery.interrupt().catch(() => undefined);
  }
}

function loadMcpServers(): Record<string, McpServerConfig> | undefined {
  try {
    if (!fs.existsSync(mcpConfigPath)) {
      console.log(`[MCP] 未找到配置文件: ${mcpConfigPath}，跳过 MCP`);
      rawMcpConfig = {};
      cachedMcpInspect = null;
      return undefined;
    }

    const raw = fs.readFileSync(mcpConfigPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    const mcpServers = parsed && typeof parsed === "object" && !Array.isArray(parsed) && "mcpServers" in parsed
      ? (parsed as McpConfigFile).mcpServers
      : parsed;

    if (!mcpServers || typeof mcpServers !== "object" || Array.isArray(mcpServers)) {
      console.warn(`[MCP] 配置文件格式无效: ${mcpConfigPath}`);
      rawMcpConfig = {};
      cachedMcpInspect = null;
      return undefined;
    }

    rawMcpConfig = mcpServers as Record<string, McpServerConfigWithDisabled>;
    const enabledServers = Object.fromEntries(
      Object.entries(rawMcpConfig)
        .filter(([, config]) => !config.disabled)
        .map(([name, config]) => {
          const { disabled, ...sdkConfig } = config;
          return [name, sdkConfig as McpServerConfig];
        })
    );

    cachedMcpInspect = null;
    console.log(`[MCP] 已加载 ${Object.keys(rawMcpConfig).length} 个 MCP Server 配置，启用 ${Object.keys(enabledServers).length} 个`);
    return Object.keys(enabledServers).length > 0 ? enabledServers : undefined;
  } catch (error: any) {
    console.error(`[MCP] 加载配置失败: ${error?.message || error}`);
    rawMcpConfig = {};
    cachedMcpInspect = null;
    return undefined;
  }
}

// 从原始 mcpServers 映射（可能含 disabled 标记）归一化为 SDK 可用的配置，过滤禁用项
function normalizeMcpServers(
  raw: Record<string, McpServerConfigWithDisabled> | undefined
): Record<string, McpServerConfig> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const enabled = Object.fromEntries(
    Object.entries(raw)
      .filter(([, config]) => config && !config.disabled)
      .map(([name, config]) => {
        const { disabled, ...sdkConfig } = config;
        return [name, sdkConfig as McpServerConfig];
      })
  );
  return Object.keys(enabled).length > 0 ? enabled : undefined;
}

function serializeMcpConfigStatus() {
  return rawMcpConfig
    ? Object.entries(rawMcpConfig).map(([name, config]) => ({ name, status: config.disabled ? "disabled" : "pending" }))
    : [];
}

function normalizeSlashCommands(commands: unknown): SlashCommand[] {
  if (!Array.isArray(commands)) return [];

  return commands
    .map((command: any) => {
      if (typeof command === "string") {
        return { name: command.replace(/^\//, ""), description: "", argumentHint: "" };
      }

      if (command && typeof command.name === "string") {
        return {
          name: command.name.replace(/^\//, ""),
          description: command.description || "",
          argumentHint: command.argumentHint || command.input?.hint || "",
        };
      }

      return null;
    })
    .filter((command): command is SlashCommand => Boolean(command));
}

function mergeSkillsFromInit(message: any): SlashCommand[] {
  const skillCommands = normalizeSlashCommands(message.skills);
  const slashCommands = normalizeSlashCommands(message.slash_commands);
  const merged = new Map<string, SlashCommand>();

  [...skillCommands, ...slashCommands].forEach(command => {
    merged.set(command.name, command);
  });

  return Array.from(merged.values());
}

function buildSystemPrompt(basePrompt: string, skills: SlashCommand[]): string {
  if (skills.length === 0) {
    return basePrompt;
  }

  const skillList = skills
    .map(skill => {
      const description = skill.description ? `: ${skill.description}` : "";
      const hint = skill.argumentHint ? ` ${skill.argumentHint}` : "";
      return `- /${skill.name}${hint}${description}`;
    })
    .join("\n");

  return `${basePrompt}\n\n可用 Skill 如下。当用户意图适合某个 Skill 时，请主动使用对应的 /skill 命令触发，不要要求用户手动输入命令：\n${skillList}`;
}

function groupMcpTools(tools: unknown): Record<string, string[]> {
  if (!Array.isArray(tools)) {
    return {};
  }

  const grouped: Record<string, Set<string>> = {};
  for (const toolName of tools) {
    if (typeof toolName !== "string" || !toolName.startsWith("mcp__")) {
      continue;
    }

    const parts = toolName.slice("mcp__".length).split("__");
    const serverName = parts.shift();
    const tool = parts.join("__");

    if (!serverName || !tool) {
      continue;
    }

    if (!grouped[serverName]) {
      grouped[serverName] = new Set<string>();
    }
    grouped[serverName].add(tool);
  }

  return Object.fromEntries(
    Object.entries(grouped).map(([serverName, serverTools]) => [serverName, Array.from(serverTools).sort()])
  );
}

async function inspectMcpServers(force = false): Promise<McpInspectResult> {
  const now = Date.now();
  if (!force && cachedMcpInspect && now - cachedMcpInspect.inspectedAt < MCP_INSPECT_CACHE_MS) {
    return cachedMcpInspect;
  }

  if (!cachedMcpServers || Object.keys(cachedMcpServers).length === 0) {
    cachedMcpInspect = { status: [], toolsByServer: {}, inspectedAt: now };
    return cachedMcpInspect;
  }

  const stream = query({
    prompt: "mcp-inspect",
    options: {
      cwd: process.cwd(),
      model: defaultModel,
      maxTurns: 1,
      permissionMode: 'bypassPermissions',
      includePartialMessages: false,
      settingSources: ['user', 'project'],
      mcpServers: cachedMcpServers,
      strictMcpConfig: false,
      env: getSdkEnv(),
      stderr: (data: string) => {
        console.log(`[MCP inspect stderr] ${data.trim()}`);
      },
    }
  });

  const timeout = setTimeout(() => {
    stream.interrupt().catch(() => undefined);
  }, MCP_INSPECT_TIMEOUT_MS);

  try {
    for await (const msg of stream) {
      if (msg.type === "system" && (msg as any).subtype === "init") {
        const initMessage = msg as any;
        const status = Array.isArray(initMessage.mcp_servers) ? initMessage.mcp_servers : [];
        const toolsByServer = groupMcpTools(initMessage.tools);
        lastMcpStatus = status;
        cachedMcpInspect = {
          status,
          toolsByServer,
          inspectedAt: Date.now(),
        };
        await stream.interrupt().catch(() => undefined);
        return cachedMcpInspect;
      }
    }
  } catch (error: any) {
    console.error(`[MCP inspect] 巡检失败: ${error?.message || error}`);
  } finally {
    clearTimeout(timeout);
  }

  cachedMcpInspect = {
    status: lastMcpStatus,
    toolsByServer: {},
    inspectedAt: Date.now(),
  };
  return cachedMcpInspect;
}

function buildMcpServerList(inspect: McpInspectResult): McpServerInfo[] {
  const statusByName = new Map(inspect.status.map(server => [server.name, server.status]));

  return Object.entries(rawMcpConfig).map(([name, config]) => {
    const enabled = !config.disabled;
    const status = enabled ? (statusByName.get(name) || "pending") : "disabled";
    return {
      name,
      type: config.type || "stdio",
      enabled,
      status,
      tools: (inspect.toolsByServer[name] || []).map(toolName => ({ name: toolName })),
    };
  });
}

cachedMcpServers = loadMcpServers();

// 健康检查
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/mcp-status", (req, res) => {
  res.json({
    configPath: mcpConfigPath,
    configured: serializeMcpConfigStatus(),
    status: lastMcpStatus,
  });
});

// 读取当前用户的 MCP 配置（无则回退全局默认文件）
app.get("/api/mcp/config", requireAuth, async (req, res) => {
  try {
    const userCfg = await db.getUserMcpConfig(req.user!.id);
    if (userCfg) {
      res.json({ path: "user", content: JSON.stringify(userCfg, null, 2) });
      return;
    }
    const content = fs.existsSync(mcpConfigPath)
      ? fs.readFileSync(mcpConfigPath, "utf-8")
      : JSON.stringify({ mcpServers: {} }, null, 2);
    res.json({ path: mcpConfigPath, content });
  } catch (error: any) {
    console.error("[MCP config] 读取失败:", error);
    res.status(500).json({ error: error?.message || "读取 MCP 配置失败" });
  }
});

// 保存当前用户的 MCP 配置到数据库（每用户隔离）
app.put("/api/mcp/config", requireAuth, async (req, res) => {
  try {
    const { content } = req.body;
    if (typeof content !== "string") {
      return res.status(400).json({ error: "content 必须是字符串" });
    }

    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return res.status(400).json({ error: "mcp.json 必须是 JSON 对象" });
    }

    const mcpServers = "mcpServers" in parsed ? (parsed as McpConfigFile).mcpServers : parsed;
    if (!mcpServers || typeof mcpServers !== "object" || Array.isArray(mcpServers)) {
      return res.status(400).json({ error: "mcpServers 必须是对象" });
    }

    // 统一存成 { mcpServers: {...} } 形态
    const toStore = "mcpServers" in (parsed as any) ? parsed : { mcpServers };
    await db.setUserMcpConfig(req.user!.id, toStore);
    res.json({ success: true, path: "user" });
  } catch (error: any) {
    console.error("[MCP config] 保存失败:", error);
    res.status(400).json({ error: error?.message || "保存 MCP 配置失败" });
  }
});

// 切换当前用户某个 MCP Server 的启用状态（每用户隔离）
app.patch("/api/mcp/servers/:serverName", requireAuth, async (req, res) => {
  try {
    const { serverName } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled 必须是布尔值" });
    }

    // 以用户配置为准，无则从全局文件初始化一份
    let userCfg = await db.getUserMcpConfig(req.user!.id);
    if (!userCfg) {
      userCfg = fs.existsSync(mcpConfigPath)
        ? JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"))
        : { mcpServers: {} };
    }
    const mcpServers = (userCfg as any).mcpServers || userCfg;
    const serverConfig = mcpServers[serverName];
    if (!serverConfig || typeof serverConfig !== "object" || Array.isArray(serverConfig)) {
      return res.status(404).json({ error: `未找到 MCP Server: ${serverName}` });
    }

    if (enabled) delete serverConfig.disabled;
    else serverConfig.disabled = true;

    const toStore = (userCfg as any).mcpServers ? userCfg : { mcpServers };
    await db.setUserMcpConfig(req.user!.id, toStore);

    res.json({ success: true, name: serverName, enabled, path: "user" });
  } catch (error: any) {
    console.error("[MCP server] 切换失败:", error);
    res.status(400).json({ error: error?.message || "切换 MCP Server 失败" });
  }
});

app.get("/api/mcp/servers", async (req, res) => {
  try {
    const force = req.query.force === "1" || req.query.force === "true";
    const inspect = await inspectMcpServers(force);
    res.json({
      configPath: mcpConfigPath,
      servers: buildMcpServerList(inspect),
    });
  } catch (error: any) {
    console.error("[MCP servers] 获取失败:", error);
    res.status(500).json({ error: error?.message || "获取 MCP 列表失败" });
  }
});

// 启动日志
console.log(`[Server] ========== 环境配置 ==========`);
console.log(`[Server] CODEBUDDY_API_KEY: ${process.env.CODEBUDDY_API_KEY ? '已设置 (' + process.env.CODEBUDDY_API_KEY.slice(0, 8) + '****)' : '⚠️ 未设置'}`);
console.log(`[Server] CODEBUDDY_AUTH_TOKEN: ${process.env.CODEBUDDY_AUTH_TOKEN ? '已设置' : '未设置'}`);
console.log(`[Server] CODEBUDDY_INTERNET_ENVIRONMENT: ${process.env.CODEBUDDY_INTERNET_ENVIRONMENT || '未设置（将默认 external）'}`);
console.log(`[Server] WORKING_DIR: ${process.cwd()}`);
console.log(`[Server] ================================\n`);

// 登录方式类型
type LoginMethod = 'env' | 'cli' | 'none';

interface LoginStatusResponse {
  isLoggedIn: boolean;
  method?: LoginMethod;
  envConfigured?: boolean;
  cliConfigured?: boolean;
  error?: string;
  apiKey?: string; // 脱敏后的 API Key
  envVars?: {
    apiKey?: string;
    authToken?: string;
    internetEnv?: string;
    baseUrl?: string;
  };
}

// 检查 CodeBuddy CLI 登录状态
app.get("/api/check-login", async (req, res) => {
  const response: LoginStatusResponse = {
    isLoggedIn: false,
    envConfigured: false,
    cliConfigured: false,
    envVars: {},
  };
  
  // 1. 检查环境变量
  const apiKey = process.env.CODEBUDDY_API_KEY;
  const authToken = process.env.CODEBUDDY_AUTH_TOKEN;
  const internetEnv = process.env.CODEBUDDY_INTERNET_ENVIRONMENT;
  const baseUrl = process.env.CODEBUDDY_BASE_URL;
  
  if (apiKey || authToken) {
    response.envConfigured = true;
    // 脱敏显示
    if (apiKey) {
      response.envVars!.apiKey = apiKey.slice(0, 8) + '****' + apiKey.slice(-4);
      response.apiKey = response.envVars!.apiKey;
    }
    if (authToken) {
      response.envVars!.authToken = authToken.slice(0, 8) + '****' + authToken.slice(-4);
    }
    if (internetEnv) {
      response.envVars!.internetEnv = internetEnv;
    }
    if (baseUrl) {
      response.envVars!.baseUrl = baseUrl;
    }
  }
  
  // 2. 使用 unstable_v2_authenticate 检查登录状态
  //    如果环境变量已配置，直接认定为已登录（避免 CLI 端口冲突导致挂起）
  if (response.envConfigured) {
    response.isLoggedIn = true;
    response.method = 'env';
    console.log('[Check Login] 环境变量已配置，跳过 CLI 认证检查');
  } else {
    // 没有环境变量，尝试通过 CLI 检查
    try {
      let needsLogin = false;
      
      const result = await unstable_v2_authenticate({
        environment: 'external',
        onAuthUrl: async (authState) => {
          needsLogin = true;
          console.log('[Check Login] 需要登录，认证 URL:', authState.authUrl);
          response.error = '未登录，请先登录 CodeBuddy CLI';
        },
        // 传入 env 避免 CLI 端口冲突（SERVER__PORT=0）
        env: {
          SERVER__PORT: '0',
        },
        timeout: 15000, // 15 秒超时，避免 UI 长时间挂起
      });
      
      if (!needsLogin && result?.userinfo) {
        response.isLoggedIn = true;
        response.cliConfigured = true;
        response.method = 'cli';
        console.log('[Check Login] CLI 已登录:', result.userinfo.userName);
      } else if (!needsLogin) {
        response.isLoggedIn = true;
        response.cliConfigured = true;
        response.method = 'cli';
      }
    } catch (error: any) {
      console.error("[Check Login] CLI 检查失败:", error?.message || error);
      response.error = error?.message || String(error);
      response.method = 'none';
    }
  }
  
  res.json(response);
});

// 保存环境变量配置
app.post("/api/save-env-config", async (req, res) => {
  const apiKey = typeof req.body.apiKey === 'string' ? req.body.apiKey.trim() : '';
  const authToken = typeof req.body.authToken === 'string' ? req.body.authToken.trim() : '';
  const internetEnv = typeof req.body.internetEnv === 'string' ? req.body.internetEnv.trim() : '';
  const baseUrl = typeof req.body.baseUrl === 'string' ? req.body.baseUrl.trim() : '';
  
  if (!apiKey && !authToken) {
    return res.status(400).json({ error: '请至少配置 API Key 或 Auth Token' });
  }

  const envUpdates = {
    CODEBUDDY_API_KEY: apiKey || undefined,
    CODEBUDDY_AUTH_TOKEN: authToken || undefined,
    CODEBUDDY_INTERNET_ENVIRONMENT: internetEnv || 'external',
    CODEBUDDY_BASE_URL: baseUrl || undefined,
  };

  const validationEnv = getSdkEnv(envUpdates);

  try {
    await validateSdkAuth(validationEnv);
  } catch (error: any) {
    const message = getAuthErrorMessage(error);
    console.error(`[Save Env] 认证校验失败:`, message);
    return res.status(401).json({
      success: false,
      error: `认证失败：${message}`,
    });
  }
  
  const configuredVars: string[] = [];
  
  // 校验通过后，替换当前进程内的认证环境变量。
  if (apiKey) {
    process.env.CODEBUDDY_API_KEY = apiKey;
    configuredVars.push('CODEBUDDY_API_KEY');
  } else {
    delete process.env.CODEBUDDY_API_KEY;
  }
  if (authToken) {
    process.env.CODEBUDDY_AUTH_TOKEN = authToken;
    configuredVars.push('CODEBUDDY_AUTH_TOKEN');
  } else {
    delete process.env.CODEBUDDY_AUTH_TOKEN;
  }
  if (internetEnv) {
    process.env.CODEBUDDY_INTERNET_ENVIRONMENT = internetEnv;
    configuredVars.push('CODEBUDDY_INTERNET_ENVIRONMENT');
  } else {
    // 默认设为 external
    process.env.CODEBUDDY_INTERNET_ENVIRONMENT = 'external';
  }
  if (baseUrl) {
    process.env.CODEBUDDY_BASE_URL = baseUrl;
    configuredVars.push('CODEBUDDY_BASE_URL');
  } else {
    delete process.env.CODEBUDDY_BASE_URL;
  }
  
  // 清除模型缓存，以便重新获取
  cachedModels = [];
  
  res.json({ 
    success: true, 
    message: `已设置: ${configuredVars.join(', ')}`,
    note: '环境变量仅在当前服务器进程有效，重启后需要重新设置'
  });
});

// 获取可用模型列表
app.get("/api/models", async (req, res) => {
  try {
    if (cachedModels.length === 0) {
      console.log("[Models] Creating session to fetch available models...");
      
      const session = await unstable_v2_createSession({ 
        cwd: process.cwd()
      });
      
      console.log("[Models] Session created, calling getAvailableModels()...");
      const models = await session.getAvailableModels();
      console.log("[Models] Got", models.length, "models");
      
      if (models && Array.isArray(models)) {
        cachedModels = models;
      }
    }
    
    res.json({ 
      models: cachedModels.length > 0 ? cachedModels : [
        { modelId: "auto", name: "Auto (自动选择)" },
        { modelId: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
        { modelId: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
        { modelId: "glm-5.2", name: "GLM 5.2" },
        { modelId: "kimi-k2.7", name: "Kimi K2.7" },
        { modelId: "minimax-m3", name: "MiniMax M3" },
      ],
      defaultModel 
    });
  } catch (error: any) {
    console.error("[Models] Error:", error);
    res.json({
      models: [
        { modelId: "auto", name: "Auto (自动选择)" },
        { modelId: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
      ],
      defaultModel,
      error: error?.message || String(error)
    });
  }
});

// ============= 会话 API =============

// 获取所有会话（包含消息数量）
app.get("/api/sessions", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const sessions = await db.getAllSessions(userId);
    const sessionsWithMessages = await Promise.all(
      sessions.map(async session => {
        const messages = await db.getMessagesBySession(session.id, userId);
        return {
          ...session,
          messageCount: messages.length
        };
      })
    );
    res.json({ sessions: sessionsWithMessages });
  } catch (error: any) {
    console.error("[Sessions] Error:", error);
    res.status(500).json({ error: error?.message || "获取会话失败" });
  }
});

// 获取单个会话及其消息
app.get("/api/sessions/:sessionId", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.id;
    const session = await db.getSession(sessionId, userId);

    if (!session) {
      return res.status(404).json({ error: "会话不存在" });
    }

    const messages = await db.getMessagesBySession(sessionId, userId);

    // 解析 tool_calls JSON
    const parsedMessages = messages.map(msg => ({
      ...msg,
      tool_calls: msg.tool_calls ? JSON.parse(msg.tool_calls) : null
    }));

    res.json({ session, messages: parsedMessages });
  } catch (error: any) {
    console.error("[Session] Error:", error);
    res.status(500).json({ error: error?.message || "获取会话失败" });
  }
});

// 创建新会话
app.post("/api/sessions", requireAuth, async (req, res) => {
  try {
    const { model = defaultModel, title = "新对话" } = req.body;
    const now = new Date().toISOString();

    const session = await db.createSession({
      id: uuidv4(),
      user_id: req.user!.id,
      title,
      model,
      sdk_session_id: null,
      created_at: now,
      updated_at: now
    });

    res.json({ session });
  } catch (error: any) {
    console.error("[Create Session] Error:", error);
    res.status(500).json({ error: error?.message || "创建会话失败" });
  }
});

// 更新会话
app.patch("/api/sessions/:sessionId", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { title, model } = req.body;

    const success = await db.updateSession(sessionId, req.user!.id, { title, model });

    if (!success) {
      return res.status(404).json({ error: "会话不存在" });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("[Update Session] Error:", error);
    res.status(500).json({ error: error?.message || "更新会话失败" });
  }
});

// 删除会话
app.delete("/api/sessions/:sessionId", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const success = await db.deleteSession(sessionId, req.user!.id);

    if (!success) {
      return res.status(404).json({ error: "会话不存在" });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("[Delete Session] Error:", error);
    res.status(500).json({ error: error?.message || "删除会话失败" });
  }
});

// ============= 聊天 API =============

// 权限响应 API
app.post("/api/permission-response", (req, res) => {
  const { requestId, behavior, message } = req.body;
  
  console.log(`[Permission] Response received: requestId=${requestId}, behavior=${behavior}`);
  
  const pending = pendingPermissions.get(requestId);
  if (!pending) {
    console.log(`[Permission] Request not found: ${requestId}`);
    return res.status(404).json({ error: "权限请求不存在或已超时" });
  }
  
  // 清除请求
  pendingPermissions.delete(requestId);
  
  if (behavior === 'allow') {
    pending.resolve({
      behavior: 'allow',
      updatedInput: pending.input
    });
  } else {
    pending.resolve({
      behavior: 'deny',
      message: message || '用户拒绝了此操作'
    });
  }
  
  res.json({ success: true });
});

// 发送消息并获取流式响应
app.post("/api/chat", requireAuth, async (req, res) => {
  const { sessionId, message, model, systemPrompt, cwd, permissionMode } = req.body;
  const userId = req.user!.id;

  // 请求日志
  console.log(`\n[Chat] ========== 新请求 ==========`);
  console.log(`[Chat] SessionId: ${sessionId}`);
  console.log(`[Chat] Model: ${model}`);
  console.log(`[Chat] Message: ${message?.slice(0, 100)}${message?.length > 100 ? '...' : ''}`);
  console.log(`[Chat] CWD: ${cwd || 'default'}`);

  if (!message) {
    console.log(`[Chat] 错误: 消息为空`);
    return res.status(400).json({ error: "消息不能为空" });
  }

  // 获取或创建会话
  let session = sessionId ? await db.getSession(sessionId, userId) : null;
  const now = new Date().toISOString();

  if (!session) {
    // 创建新会话
    console.log(`[Chat] 创建新会话`);
    session = await db.createSession({
      id: sessionId || uuidv4(),
      user_id: userId,
      title: message.slice(0, 30) + (message.length > 30 ? '...' : ''),
      model: model || defaultModel,
      sdk_session_id: null,  // 稍后从 SDK 获取
      created_at: now,
      updated_at: now
    });
  } else {
    console.log(`[Chat] 使用现有会话, SDK Session: ${session.sdk_session_id || 'none'}`);
  }

  const selectedModel = model || session.model;
  
  // 获取 SDK session ID（用于恢复对话）
  const sdkSessionId = session.sdk_session_id;

  // 创建用户消息 ID 和助手消息 ID
  const userMessageId = uuidv4();
  const assistantMessageId = uuidv4();

  // 保存用户消息到数据库
  try {
    await db.createMessage({
      id: userMessageId,
      session_id: session.id,
      role: 'user',
      content: message,
      model: null,
      created_at: now,
      tool_calls: null
    });
    console.log(`[Chat] 用户消息已保存: ${userMessageId}`);
  } catch (dbError: any) {
    console.error(`[Chat] 保存用户消息失败:`, dbError);
    return res.status(500).json({ error: "保存消息失败", detail: dbError?.message });
  }

  // 设置 SSE 头
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // 默认系统提示词
  const defaultSystemPrompt = "你是一个专业的AI助手，善于帮助用户解决各种问题。请用简洁清晰的方式回答问题。";
  const finalSystemPrompt = buildSystemPrompt(systemPrompt || defaultSystemPrompt, lastAvailableSkills);

  // 每用户 MCP 配置：登录用户若有自定义配置则使用它，否则回退到全局默认
  let effectiveMcpServers: Record<string, McpServerConfig> | undefined = cachedMcpServers;
  try {
    const userMcp = await db.getUserMcpConfig(userId);
    if (userMcp && userMcp.mcpServers) {
      effectiveMcpServers = normalizeMcpServers(userMcp.mcpServers);
      console.log(`[Chat] 使用用户自定义 MCP 配置 (${Object.keys(effectiveMcpServers || {}).length} 个)`);
    }
  } catch (e: any) {
    console.warn(`[Chat] 加载用户 MCP 配置失败，回退默认: ${e?.message || e}`);
  }

  // 工作目录：优先使用请求中的 cwd，否则使用当前目录
  const workingDir = cwd || process.cwd();
  let streamTimeoutChecker: ReturnType<typeof setInterval> | undefined;
  let streamClosed = false;
  let streamLastActivity = Date.now();
  let activePermissionRequests = 0;
  const activePermissionRequestIds = new Set<string>();
  const abortController = new AbortController();
  let stream: ReturnType<typeof query> | undefined;

  const closeStream = async (reason: string) => {
    if (streamClosed) return;
    console.log(`[Chat] Closing stream: ${reason}`);
    streamClosed = true;
    abortController.abort();

    for (const requestId of Array.from(activePermissionRequestIds)) {
      const pending = pendingPermissions.get(requestId);
      if (pending) {
        pendingPermissions.delete(requestId);
        pending.resolve({
          behavior: 'deny',
          message: reason,
        });
      }
    }
    activePermissionRequestIds.clear();

    try {
      await stream?.interrupt();
    } catch (error: any) {
      console.warn(`[Chat] Failed to interrupt stream: ${error?.message || error}`);
    }
  };

  res.on('close', () => {
    if (!streamClosed) {
      closeStream('客户端已停止输出').catch(error => {
        console.warn(`[Chat] Close cleanup failed: ${error?.message || error}`);
      });
    }
  });

  // 并发护栏：占用一个 agent 槽位；超限时排队并通知前端
  if (agentActive >= AGENT_MAX_CONCURRENCY) {
    console.log(`[Chat] agent 并发已满(${agentActive}/${AGENT_MAX_CONCURRENCY})，排队中，前面还有 ${agentQueueDepth()} 个`);
    res.write(`data: ${JSON.stringify({ type: "queued", position: agentQueueDepth() + 1 })}\n\n`);
  }
  await acquireAgentSlot();
  let agentSlotReleased = false;
  const releaseOnce = () => {
    if (!agentSlotReleased) {
      agentSlotReleased = true;
      releaseAgentSlot();
    }
  };

  try {
    console.log(`[Chat] 调用 SDK query...`);
    console.log(`[Chat] - Model: ${selectedModel}`);
    console.log(`[Chat] - Resume: ${sdkSessionId || 'none'}`);
    console.log(`[Chat] - CWD: ${workingDir}`);
    console.log(`[Chat] - PermissionMode: ${permissionMode || 'default'}`);
    console.log(`[Chat] - API Key: ${process.env.CODEBUDDY_API_KEY ? 'YES (' + process.env.CODEBUDDY_API_KEY.slice(0, 8) + '****)' : 'NO ⚠️'}`);
    console.log(`[Chat] - Message length: ${message.length} chars`);
    console.log(`[Chat] - MCP Servers: ${cachedMcpServers ? Object.keys(cachedMcpServers).join(', ') : 'none'}`);
    console.log(`[Chat] - Cached Skills: ${lastAvailableSkills.length}`);
    
    // 创建 canUseTool 回调
    const canUseTool: CanUseTool = async (toolName, input, options) => {
      console.log(`[Permission] Tool request: ${toolName}`);
      console.log(`[Permission] Input:`, JSON.stringify(input, null, 2));
      
      // bypassPermissions 模式直接放行
      if (permissionMode === 'bypassPermissions') {
        console.log(`[Permission] Bypassing permissions for ${toolName}`);
        return { behavior: 'allow', updatedInput: input };
      }
      
      // 创建权限请求
      const requestId = uuidv4();
      const permissionRequest = {
        requestId,
        toolUseId: options.toolUseID,
        toolName,
        input,
        sessionId: session.id,
        timestamp: Date.now()
      };
      
      // 发送权限请求到前端
      res.write(`data: ${JSON.stringify({ 
        type: "permission_request", 
        ...permissionRequest
      })}\n\n`);
      streamLastActivity = Date.now();
      activePermissionRequests += 1;
      
      // 创建 Promise 等待用户响应
      return new Promise<PermissionResult>((resolve, reject) => {
        const pending: PendingPermission = {
          resolve,
          reject,
          toolName,
          input,
          sessionId: session.id,
          timestamp: Date.now()
        };
        
        pendingPermissions.set(requestId, pending);
        activePermissionRequestIds.add(requestId);
        
        // 设置超时
        setTimeout(() => {
          if (pendingPermissions.has(requestId)) {
            pendingPermissions.delete(requestId);
            activePermissionRequestIds.delete(requestId);
            console.log(`[Permission] Request timeout: ${requestId}`);
            resolve({
              behavior: 'deny',
              message: '权限请求超时'
            });
          }
        }, PERMISSION_TIMEOUT);
      }).finally(() => {
        activePermissionRequestIds.delete(requestId);
        activePermissionRequests = Math.max(0, activePermissionRequests - 1);
        streamLastActivity = Date.now();
      });
    };
    
    // 使用 Query API 发送消息
    // 如果有 sdk_session_id，使用 resume 恢复对话上下文
    stream = query({
      prompt: message,
      options: {
        cwd: workingDir,
        model: selectedModel,
        maxTurns: 10,
        systemPrompt: finalSystemPrompt,
        permissionMode: permissionMode || 'default',
        canUseTool,
        includePartialMessages: true,
        settingSources: ['user', 'project'],
        abortController,
        ...(effectiveMcpServers ? { mcpServers: effectiveMcpServers, strictMcpConfig: false } : {}),
        // 显式传递环境变量，确保 CLI 能访问 API Key
        // 过滤 undefined，避免覆盖父进程环境变量
        // SERVER__PORT=0 让 CLI 使用随机端口，避免与 WorkBuddy 端口冲突
        env: getSdkEnv(),
        // 捕获 CLI stderr 用于排查问题
        stderr: (data: string) => {
          console.log(`[CLI stderr] ${data.trim()}`);
        },
        ...(sdkSessionId ? { resume: sdkSessionId } : {})  // 使用 resume 恢复对话
      }
    });

    let fullResponse = "";
    let toolCalls: Array<{ 
      id: string; 
      name: string; 
      input?: Record<string, unknown>;
      status: string; 
      result?: string;
      isError?: boolean;
    }> = [];
    let newSdkSessionId: string | null = null;  // 用于存储 SDK 返回的 session_id

    // 发送会话ID和消息ID
    res.write(`data: ${JSON.stringify({ 
      type: "init", 
      sessionId: session.id, 
      userMessageId, 
      assistantMessageId,
      model: selectedModel,
      mcpServers: lastMcpStatus.length > 0 ? lastMcpStatus : serializeMcpConfigStatus(),
      skills: lastAvailableSkills,
    })}\n\n`);

    // 当前正在执行的工具 ID（用于匹配 tool_result）
    let currentToolId: string | null = null;

    // 处理流式响应
    const STREAM_TIMEOUT_MS = 45_000; // 45秒无响应即超时
    streamTimeoutChecker = setInterval(() => {
      if (!streamClosed && activePermissionRequests === 0 && Date.now() - streamLastActivity > STREAM_TIMEOUT_MS) {
        console.error(`[Stream] TIMEOUT: ${STREAM_TIMEOUT_MS}ms 无活动，强制结束`);
        res.write(`data: ${JSON.stringify({ type: "error", message: "响应超时，CLI 进程可能卡住或认证失败" })}\n\n`);
        closeStream('响应超时').catch(error => {
          console.warn(`[Chat] Timeout cleanup failed: ${error?.message || error}`);
        });
        res.end();
      }
    }, 10_000);
    
    for await (const msg of stream) {
      if (streamClosed) break;
      streamLastActivity = Date.now();
      console.log("[Stream] Message type:", msg.type, JSON.stringify(msg).slice(0, 200));
      
      // 处理 system 消息，获取 SDK 的 session_id
      if (msg.type === "system" && (msg as any).subtype === "init") {
        const initMessage = msg as any;
        newSdkSessionId = initMessage.session_id;
        lastMcpStatus = Array.isArray(initMessage.mcp_servers) ? initMessage.mcp_servers : lastMcpStatus;
        lastAvailableSkills = mergeSkillsFromInit(initMessage);
        console.log(`[Stream] Got SDK session_id: ${newSdkSessionId}`);
        console.log(`[Stream] MCP status: ${lastMcpStatus.map(server => `${server.name}:${server.status}`).join(', ') || 'none'}`);
        console.log(`[Stream] Available skills: ${lastAvailableSkills.map(skill => skill.name).join(', ') || 'none'}`);
        
        res.write(`data: ${JSON.stringify({ 
          type: "metadata",
          mcpServers: lastMcpStatus,
          skills: lastAvailableSkills,
        })}\n\n`);
        
        // 保存 SDK session_id 到数据库（如果是新的）
        if (newSdkSessionId && newSdkSessionId !== sdkSessionId) {
          await db.updateSession(session.id, userId, { sdk_session_id: newSdkSessionId });
          console.log(`[Stream] Saved SDK session_id to database`);
        }
      } else if (msg.type === "stream_event") {
        const event = (msg as any).event;
        if (event?.type === "content_block_delta") {
          const delta = event.delta;
          if (delta?.type === "text_delta" && delta.text) {
            fullResponse += delta.text;
            res.write(`data: ${JSON.stringify({ type: "text", content: delta.text })}\n\n`);
          } else if (delta?.type === "thinking_delta" && delta.thinking) {
            res.write(`data: ${JSON.stringify({ type: "thinking", content: delta.thinking })}\n\n`);
          }
        }
      } else if (msg.type === "assistant") {
        const content = msg.message.content;

        if (typeof content === "string") {
          if (!fullResponse) {
            fullResponse += content;
            res.write(`data: ${JSON.stringify({ type: "text", content })}\n\n`);
          }
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text") {
              if (!fullResponse) {
                fullResponse += block.text;
                res.write(`data: ${JSON.stringify({ type: "text", content: block.text })}\n\n`);
              }
            } else if (block.type === "tool_use") {
              if (toolCalls.some(tool => tool.id === block.id)) {
                continue;
              }
              currentToolId = block.id || uuidv4();
              const toolInput = (block as any).input || {};
              console.log(`[Stream] Tool use: id=${currentToolId}, name=${block.name}`);
              console.log(`[Stream] Tool input:`, JSON.stringify(toolInput, null, 2));
              
              const toolCall = { 
                id: currentToolId, 
                name: block.name, 
                input: toolInput,
                status: "running" 
              };
              toolCalls.push(toolCall);
              res.write(`data: ${JSON.stringify({ 
                type: "tool", 
                id: toolCall.id,
                name: toolCall.name,
                input: toolCall.input,
                status: toolCall.status
              })}\n\n`);
            }
          }
        }
      } else if (msg.type === "error") {
        const errorMessage = (msg as any).error || "处理请求时发生错误";
        console.error(`[Stream] Error message: ${errorMessage}`);
        res.write(`data: ${JSON.stringify({ type: "error", message: errorMessage })}\n\n`);
        streamClosed = true;
        res.end();
        break;
      } else if ((msg as any).type === "tool_result") {
        // 处理工具结果（独立的消息类型）
        const msgAny = msg as any;
        const toolId = msgAny.tool_use_id || currentToolId;
        const isError = msgAny.is_error || false;
        const content = msgAny.content;
        
        console.log(`[Stream] Tool result: tool_use_id=${toolId}, is_error=${isError}`);
        console.log(`[Stream] Tool result content type:`, typeof content);
        console.log(`[Stream] Tool result content:`, typeof content === 'string' ? content.slice(0, 500) : JSON.stringify(content, null, 2)?.slice(0, 500));
        
        const tool = toolCalls.find(t => t.id === toolId) || toolCalls[toolCalls.length - 1];
        if (tool) {
          tool.status = isError ? "error" : "completed";
          tool.isError = isError;
          tool.result = typeof content === 'string' 
            ? content 
            : JSON.stringify(content);
          res.write(`data: ${JSON.stringify({ 
            type: "tool_result", 
            toolId: tool.id, 
            content: tool.result,
            isError: isError
          })}\n\n`);
        }
        currentToolId = null;
      } else if (msg.type === "result") {
        // 完成时确保所有工具都标记为完成
        toolCalls.forEach(tool => {
          if (tool.status === "running") {
            tool.status = "completed";
            res.write(`data: ${JSON.stringify({ type: "tool_result", toolId: tool.id, content: tool.result || "已完成" })}\n\n`);
          }
        });
        
        // 检查是否是执行错误（如模型不存在）
        if ((msg as any).is_error) {
          const errors = (msg as any).errors || [];
          const errorMsg = errors.length > 0 ? errors.join('\n') : '未知错误';
          console.error(`[Stream] Execution error: ${errorMsg}`);
          res.write(`data: ${JSON.stringify({ type: "error", message: errorMsg, subtype: (msg as any).subtype })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ type: "done", duration: (msg as any).duration_ms, cost: (msg as any).total_cost_usd })}\n\n`);
        }
      }
    }

    // 保存助手消息到数据库
    await db.createMessage({
      id: assistantMessageId,
      session_id: session.id,
      role: 'assistant',
      content: fullResponse,
      model: selectedModel,
      created_at: new Date().toISOString(),
      tool_calls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null
    });

    // 更新会话标题（如果是第一条消息）
    const messages = await db.getMessagesBySession(session.id, userId);
    if (messages.length <= 2) {
      await db.updateSession(session.id, userId, {
        title: message.slice(0, 30) + (message.length > 30 ? '...' : ''),
        model: selectedModel
      });
    }

    if (streamTimeoutChecker) clearInterval(streamTimeoutChecker);
    console.log(`[Chat] 请求完成 ✓`);
    if (!streamClosed) {
      streamClosed = true;
      res.end();
    }
  } catch (error: any) {
    if (streamTimeoutChecker) clearInterval(streamTimeoutChecker);
    console.error(`\n[Chat] ========== 错误 ==========`);
    console.error(`[Chat] Error Name:`, error?.name);
    console.error(`[Chat] Error Message:`, error?.message);
    console.error(`[Chat] Error Code:`, error?.code);
    console.error(`[Chat] Error Stack:`, error?.stack);
    console.error(`[Chat] Full Error:`, JSON.stringify(error, null, 2));
    
    const errorMessage = error?.message || "处理请求时发生错误";
    if (!streamClosed) {
      res.write(`data: ${JSON.stringify({ type: "error", message: errorMessage })}\n\n`);
      streamClosed = true;
      res.end();
    }
  } finally {
    releaseOnce();
  }
});

// ============= 志愿填报报告 API（择校 / 调剂）=============

/** 轻量手写校验（避免引入 zod）。考研模型：分数 + 专业/地区/层次，无文理选科。 */
function parseVibeInput(body: unknown): { ok: true; data: VibeReportInput } | { ok: false; message: string } {
  if (!body || typeof body !== "object") return { ok: false, message: "invalid payload" };
  const b = body as Record<string, unknown>;

  const score = b.score;
  if (typeof score !== "number" || !Number.isInteger(score) || score < 100 || score > 500) {
    return { ok: false, message: "score 必须是 100-500 之间的整数（考研初试总分）" };
  }

  const toStringArray = (v: unknown): string[] | undefined => {
    if (v == null) return undefined;
    if (!Array.isArray(v)) return undefined;
    const arr = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    return arr.length ? arr : undefined;
  };

  const level = typeof b.level === "string" && b.level.trim() ? b.level.trim() : null;

  return {
    ok: true,
    data: {
      score,
      majorKeywords: toStringArray(b.majorKeywords),
      regionPrefs: toStringArray(b.regionPrefs),
      level,
    },
  };
}

// 择校报告（取数参考 recommend 模块：yanbot 开放接口 · 一志愿录取分数）
app.post("/api/tools/school-report/vibe", requireAuth, async (req, res) => {
  const parsed = parseVibeInput(req.body);
  if (!parsed.ok) {
    return res.json({ code: 1, success: false, message: parsed.message });
  }
  if (!isYanbotConfigured()) {
    return res.json({
      code: 1,
      success: false,
      message: "未配置 yanbot 开放接口凭据，请在 .env 设置 OPEN_API_KEY 与 OPEN_API_SECRET 后重启服务",
    });
  }
  try {
    const data = await generateVibeReport(parsed.data);
    res.json({ code: 0, success: true, data });
  } catch (err: any) {
    console.error("[school-report/vibe]", err);
    const message =
      err instanceof YanbotApiError ? err.message : err?.message || "服务暂时不可用，请稍后重试";
    res.status(500).json({ code: 1, success: false, message });
  }
});

// 调剂报告（取数参考 recommend 模块：yanbot 开放接口 · 调剂录取分数）
app.post("/api/tools/tiaoji-report/vibe", requireAuth, async (req, res) => {
  const parsed = parseVibeInput(req.body);
  if (!parsed.ok) {
    return res.json({ code: 1, success: false, message: parsed.message });
  }
  if (!isYanbotConfigured()) {
    return res.json({
      code: 1,
      success: false,
      message: "未配置 yanbot 开放接口凭据，请在 .env 设置 OPEN_API_KEY 与 OPEN_API_SECRET 后重启服务",
    });
  }
  try {
    const data = await generateTiaojiReport(parsed.data);
    res.json({ code: 0, success: true, data });
  } catch (err: any) {
    console.error("[tiaoji-report/vibe]", err);
    const message =
      err instanceof YanbotApiError ? err.message : err?.message || "服务暂时不可用，请稍后重试";
    res.status(500).json({ code: 1, success: false, message });
  }
});

// ============= 志愿推荐 API =============

interface ScoreBand {
  firstMin: number;
  firstMax: number;
  adjustMax: number;
}

interface ParsedQuery {
  score: number | null;
  subjectName?: string;
  provinceName?: string;
  level?: string | null;
  targetSchoolName?: string;
  year?: number | null;
  band: ScoreBand;
  note?: string;
}

interface FilterDelta {
  firstMinDelta?: number;
  firstMaxDelta?: number;
  adjustMaxDelta?: number;
  level?: string | null;
}

interface SchoolCard {
  schoolName: string;
  schoolCode: string;
  level?: string;
  provinceName?: string;
  subjectName: string;
  subjectCode: string;
  college?: string;
  year: number;
  lowestScore?: number;
  averageScore?: number;
  highestScore?: number;
  admissions?: number;
  applicants?: number | string;
  remarks?: string;
  scoreDiff?: number;
  tier?: "冲" | "稳" | "保";
  is985?: boolean;
  is211?: boolean;
  isDualClass?: boolean;
}

let cachedLatestYear: number | null = null;

function defaultBand(score: number | null): ScoreBand {
  const s = typeof score === "number" && score > 0 ? score : 330;
  return { firstMin: s - 20, firstMax: s + 10, adjustMax: s + 5 };
}

function extractJson(text: string): any {
  if (!text) return null;
  // 优先解析 ```json ... ``` 或第一个 {...}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

const RECOMMEND_PARSE_PROMPT = `你是考研志愿推荐的需求解析器。请把老师的自然语言需求解析为 JSON，仅输出 JSON，不要任何多余文字、解释或 markdown。

输出字段：
{
  "score": 数字或 null,            // 考生预估总分（考研初试总分，通常 250-450）
  "subjectName": 字符串或省略,      // 报考专业名称关键词（如 "计算机" "法律"）
  "provinceName": 字符串或省略,     // 目标地区/省份（如 "江苏" "北京"）
  "level": "双一流"|"211"|"985"|null, // 院校层次要求，无则 null
  "targetSchoolName": 字符串或省略, // 明确点名的目标院校
  "year": 数字或 null,             // 指定年份，未提及为 null
  "note": 字符串或省略             // 对需求的一句话归纳
}
只返回上述 JSON 对象。`;

// 兜底：当 LLM 解析失败/缺字段时，用正则从原文抽取关键信息，保证推荐不因解析异常而中断
const PROVINCE_KEYWORDS = [
  "北京", "天津", "上海", "重庆", "河北", "山西", "辽宁", "吉林", "黑龙江", "江苏",
  "浙江", "安徽", "福建", "江西", "山东", "河南", "湖北", "湖南", "广东", "广西",
  "海南", "四川", "贵州", "云南", "陕西", "甘肃", "青海", "内蒙古", "宁夏", "新疆", "西藏",
];

// 常见报考专业关键词（与口语高度重合，正则即可覆盖多数直播提问）
const SUBJECT_KEYWORDS = [
  "计算机", "软件", "人工智能", "电子", "通信", "自动化", "机械", "材料", "土木", "建筑",
  "法律", "法学", "金融", "会计", "经济", "管理", "工商", "医学", "临床", "护理", "药学",
  "教育", "心理", "英语", "汉语", "新闻", "传播", "设计", "艺术", "数学", "物理", "化学",
  "生物", "环境", "农", "历史", "哲学", "政治", "社会",
];

// 中文数字 → 分数（覆盖 zh-CN 语音识别常见的「三百五十 / 三百五 / 三百八十五」等口语形式）
const CN_DIGITS: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
function chineseToScore(message: string): number | undefined {
  const m = message.match(/([一二两三四五六七八九])百([一二三四五六七八九])?(十)?([一二三四五六七八九])?/);
  if (!m) return undefined;
  const h = CN_DIGITS[m[1]];
  if (!h) return undefined;
  let val = h * 100;
  const a = m[2] ? CN_DIGITS[m[2]] : undefined; // 百后第一位数字
  const hasShi = Boolean(m[3]);
  const b = m[4] ? CN_DIGITS[m[4]] : undefined;
  if (a !== undefined) {
    // 三百五十[五] / 三百五（口语，a 均作十位）
    val += a * 10 + (b ?? 0);
  } else if (hasShi) {
    // 三百十几（少见）
    val += 10 + (b ?? 0);
  }
  return val;
}

function heuristicParse(message: string): Partial<ParsedQuery> {
  const out: Partial<ParsedQuery> = {};
  // 分数：优先阿拉伯数字（200~500），否则解析中文数字
  let score: number | undefined;
  const nums = message.match(/\d{2,3}/g) || [];
  for (const n of nums) {
    const v = Number(n);
    if (v >= 200 && v <= 500) {
      score = v;
      break;
    }
  }
  if (score === undefined) {
    const cn = chineseToScore(message);
    if (cn !== undefined && cn >= 200 && cn <= 500) score = cn;
  }
  if (score !== undefined) out.score = score;
  // 层次
  if (/双一流/.test(message)) out.level = "双一流";
  else if (/985/.test(message)) out.level = "985";
  else if (/211/.test(message)) out.level = "211";
  // 地区
  const prov = PROVINCE_KEYWORDS.find((p) => message.includes(p));
  if (prov) out.provinceName = prov;
  // 专业
  const subj = SUBJECT_KEYWORDS.find((s) => message.includes(s));
  if (subj) out.subjectName = subj;
  return out;
}

// 调用豆包（火山方舟 Ark，OpenAI 兼容接口）做需求解析。
// 模糊需求解析对质量要求不高、但对延迟敏感，默认用 lite 类小模型加速。
async function callDoubao(systemPrompt: string, userMessage: string): Promise<string> {
  const baseUrl = (process.env.DOUBAO_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "");
  const apiKey = process.env.DOUBAO_API_KEY;
  const model = process.env.RECOMMEND_MODEL || "doubao-1-5-lite-32k-250115";
  if (!apiKey) throw new Error("未配置 DOUBAO_API_KEY");

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Doubao API ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const data: any = await resp.json();
  return data?.choices?.[0]?.message?.content || "";
}

async function parseNlToQuery(message: string): Promise<ParsedQuery> {
  let text = "";
  try {
    text = await callDoubao(RECOMMEND_PARSE_PROMPT, message);
  } catch (e: any) {
    // LLM 解析失败（如接口报错 / 网络异常）不应使整个请求失败，转用正则兜底
    console.warn(`[Recommend] LLM 解析失败，转用正则兜底: ${e?.message || e}`);
  }

  const parsed = extractJson(text) || {};
  const fb = heuristicParse(message);
  const llmScore = typeof parsed.score === "number" ? parsed.score : Number(parsed.score) || null;
  const score = llmScore ?? fb.score ?? null;
  return {
    score,
    subjectName: parsed.subjectName || fb.subjectName || undefined,
    provinceName: parsed.provinceName || fb.provinceName || undefined,
    level: parsed.level || fb.level || null,
    targetSchoolName: parsed.targetSchoolName || undefined,
    year: typeof parsed.year === "number" ? parsed.year : null,
    band: defaultBand(score),
    note: parsed.note || undefined,
  };
}

async function resolveYear(year: number | null | undefined): Promise<number | undefined> {
  if (year) return year;
  if (cachedLatestYear) return cachedLatestYear;
  try {
    const years = await getYears();
    if (years.length > 0) {
      cachedLatestYear = years[0];
      return cachedLatestYear;
    }
  } catch (e) {
    console.warn("[Recommend] 获取最新年份失败，忽略 year 过滤");
  }
  return undefined;
}

function schoolTags(record: SchoolScoreRecord): { is985: boolean; is211: boolean; isDualClass: boolean } {
  const s = record.school;
  const level = (record.level || s?.level || "").toString();
  return {
    is985: Boolean(s?.is985) || /985/.test(level),
    is211: Boolean(s?.is211) || /211/.test(level),
    isDualClass: Boolean(s?.isDual_class) || /双一流/.test(level),
  };
}

function tierForDiff(diff: number): "冲" | "稳" | "保" {
  if (diff < 0) return "冲";
  if (diff <= 10) return "稳";
  return "保";
}

function toFirstChoiceCard(r: SchoolScoreRecord, score: number | null): SchoolCard {
  const tags = schoolTags(r);
  const diff = typeof score === "number" && typeof r.lowestScore === "number" ? score - r.lowestScore : undefined;
  return {
    schoolName: r.schoolName,
    schoolCode: r.schoolCode,
    level: r.level || r.school?.level,
    provinceName: r.provinceName,
    subjectName: r.subjectName,
    subjectCode: r.subjectCode,
    college: r.college,
    year: r.year,
    lowestScore: r.lowestScore,
    averageScore: r.averageScore,
    highestScore: r.highestScore,
    admissions: r.firstChoiceAdmissions,
    applicants: r.applicants,
    remarks: r.remarks,
    scoreDiff: diff,
    tier: typeof diff === "number" ? tierForDiff(diff) : undefined,
    ...tags,
  };
}

function toAdjustedCard(r: SchoolScoreRecord, score: number | null): SchoolCard {
  const tags = schoolTags(r);
  const diff =
    typeof score === "number" && typeof r.adjustedLowestScore === "number"
      ? score - r.adjustedLowestScore
      : undefined;
  return {
    schoolName: r.schoolName,
    schoolCode: r.schoolCode,
    level: r.level || r.school?.level,
    provinceName: r.provinceName,
    subjectName: r.subjectName,
    subjectCode: r.subjectCode,
    college: r.college,
    year: r.year,
    lowestScore: r.adjustedLowestScore,
    averageScore: r.adjustedAverageScore,
    highestScore: r.adjustedHighestScore,
    admissions: r.adjustedAdmissions,
    applicants: r.applicants,
    remarks: r.adjustedRemarks,
    scoreDiff: diff,
    ...tags,
  };
}

async function runRecommendation(pq: ParsedQuery, opts?: { fast?: boolean }) {
  const year = await resolveYear(pq.year);
  const common: Record<string, string | number | boolean | undefined> = {
    subjectName: pq.subjectName,
    provinceName: pq.provinceName,
    level: pq.level || undefined,
    schoolName: pq.targetSchoolName,
    year,
    includeSchool: true,
  };

  if (opts?.fast) {
    // 快档：直播只看一志愿前几个，只发一志愿那一路，跳过「调剂」查询（少一次 yanbot 往返）
    const firstData = await querySchoolScore({
      ...common,
      hasFirstChoice: true,
      minLowestScore: pq.band.firstMin,
      maxLowestScore: pq.band.firstMax,
      sortBy: "lowestScore",
      sortOrder: "desc",
      pageSize: 6,
    });
    const firstItems = (firstData.list || []).map((r) => toFirstChoiceCard(r, pq.score));
    return {
      parsedQuery: { ...pq, year: year ?? pq.year ?? null },
      groups: [
        { category: "一志愿", items: firstItems },
        { category: "调剂", items: [] },
      ],
      note: pq.note,
    };
  }

  const [firstData, adjustData] = await Promise.all([
    querySchoolScore({
      ...common,
      hasFirstChoice: true,
      minLowestScore: pq.band.firstMin,
      maxLowestScore: pq.band.firstMax,
      sortBy: "lowestScore",
      sortOrder: "desc",
      pageSize: 30,
    }),
    querySchoolScore({
      ...common,
      hasAdjustment: true,
      maxAdjustedLowestScore: pq.band.adjustMax,
      sortBy: "adjustedLowestScore",
      sortOrder: "desc",
      pageSize: 12,
    }),
  ]);

  const firstItems = (firstData.list || []).map((r) => toFirstChoiceCard(r, pq.score));
  const adjustItems = (adjustData.list || []).map((r) => toAdjustedCard(r, pq.score));

  return {
    parsedQuery: { ...pq, year: year ?? pq.year ?? null },
    groups: [
      { category: "一志愿", items: firstItems },
      { category: "调剂", items: adjustItems },
    ],
    note: pq.note,
  };
}

// 推荐：自然语言解析 + 两路检索 + 归一化（或按快捷筛选增量重查）
app.post("/api/recommend", requireAuth, async (req, res) => {
  if (!isYanbotConfigured()) {
    return res.status(500).json({
      error: "未配置 yanbot 开放接口凭据，请在 .env 设置 OPEN_API_KEY 与 OPEN_API_SECRET 后重启服务",
    });
  }

  const { message, prevQuery, filterDelta, fast } = req.body as {
    message?: string;
    prevQuery?: ParsedQuery;
    filterDelta?: FilterDelta;
    fast?: boolean;
  };

  try {
    let pq: ParsedQuery;

    if (prevQuery && filterDelta) {
      // 快捷按钮重查：不经 LLM，合并筛选增量
      const band: ScoreBand = {
        firstMin: prevQuery.band.firstMin + (filterDelta.firstMinDelta || 0),
        firstMax: prevQuery.band.firstMax + (filterDelta.firstMaxDelta || 0),
        adjustMax: prevQuery.band.adjustMax + (filterDelta.adjustMaxDelta || 0),
      };
      pq = {
        ...prevQuery,
        band,
        level: filterDelta.level !== undefined ? filterDelta.level : prevQuery.level,
      };
    } else {
      if (!message || !message.trim()) {
        return res.status(400).json({ error: "请输入考生信息与需求" });
      }
      if (fast) {
        // 快档：跳过 LLM，纯本地正则即时解析（说话过程中调用，追求秒回）
        const fb = heuristicParse(message);
        pq = {
          score: fb.score ?? null,
          subjectName: fb.subjectName,
          provinceName: fb.provinceName,
          level: fb.level ?? null,
          year: null,
          band: defaultBand(fb.score ?? null),
        };
      } else {
        console.log(`[Recommend] 解析需求: ${message.slice(0, 80)}`);
        pq = await parseNlToQuery(message);
      }
    }

    const result = await runRecommendation(pq, { fast: Boolean(fast) });
    res.json(result);
  } catch (error: any) {
    if (error instanceof YanbotApiError) {
      console.error("[Recommend] yanbot 接口错误:", error.message);
      return res.status(error.statusCode >= 400 ? error.statusCode : 502).json({ error: error.message });
    }
    console.error("[Recommend] 失败:", error);
    res.status(500).json({ error: error?.message || "推荐失败" });
  }
});

// ============= 案例收藏 API =============

app.get("/api/cases", requireAuth, async (req, res) => {
  try {
    const rows = await db.getAllFavoriteCases(req.user!.id);
    const cases = rows.map((r) => ({
      id: r.id,
      title: r.title,
      candidateSummary: r.candidate_summary,
      note: r.note,
      createdAt: r.created_at,
    }));
    res.json({ cases });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "获取案例失败" });
  }
});

app.get("/api/cases/:id", requireAuth, async (req, res) => {
  try {
    const row = await db.getFavoriteCase(req.params.id, req.user!.id);
    if (!row) return res.status(404).json({ error: "案例不存在" });
    res.json({
      id: row.id,
      title: row.title,
      candidateSummary: row.candidate_summary,
      note: row.note,
      createdAt: row.created_at,
      query: JSON.parse(row.query_json),
      result: JSON.parse(row.result_json),
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "获取案例失败" });
  }
});

app.post("/api/cases", requireAuth, async (req, res) => {
  try {
    const { title, candidateSummary, query: q, result, note } = req.body || {};
    if (!q || !result) {
      return res.status(400).json({ error: "缺少 query 或 result" });
    }
    const now = new Date().toISOString();
    const item = {
      id: uuidv4(),
      user_id: req.user!.id,
      title: (title && String(title).slice(0, 100)) || "未命名案例",
      candidate_summary: candidateSummary ? String(candidateSummary).slice(0, 200) : null,
      query_json: JSON.stringify(q),
      result_json: JSON.stringify(result),
      note: note ? String(note) : null,
      created_at: now,
    };
    await db.createFavoriteCase(item);
    res.json({ id: item.id, success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "收藏失败" });
  }
});

app.delete("/api/cases/:id", requireAuth, async (req, res) => {
  try {
    await db.deleteFavoriteCase(req.params.id, req.user!.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "删除失败" });
  }
});

// 案例 → 一键生成小红书宣传文案（SSE 流式）
app.post("/api/cases/:id/promo", requireAuth, async (req, res) => {
  const { model } = (req.body || {}) as { model?: string };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  let stream: ReturnType<typeof query> | null = null;
  let closed = false;
  const write = (obj: unknown) => {
    if (!closed) res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  try {
    const row = await db.getFavoriteCase(req.params.id, req.user!.id);
    if (!row) {
      write({ type: "error", message: "案例不存在" });
      return res.end();
    }

    const caseData: CasePromoData = {
      title: row.title,
      candidateSummary: row.candidate_summary,
      note: row.note,
      query: JSON.parse(row.query_json),
      result: JSON.parse(row.result_json),
    };

    const material = buildCasePromoMaterial(caseData);
    const selectedModel = model || defaultModel;

    stream = query({
      prompt: `【志愿推荐案例数据】\n\n${material}\n\n请根据以上案例数据撰写小红书宣传文案。`,
      options: {
        cwd: process.cwd(),
        model: selectedModel,
        maxTurns: 1,
        permissionMode: "bypassPermissions",
        includePartialMessages: true,
        systemPrompt: CASE_PROMO_PROMPT,
        env: getSdkEnv(),
        stderr: (data: string) => console.log(`[cases/promo stderr] ${data.trim()}`),
      },
    });

    let fullText = "";
    write({ type: "init", caseId: row.id, model: selectedModel });

    for await (const msg of stream) {
      if (closed) break;
      if ((msg as any).type === "stream_event") {
        const event = (msg as any).event;
        if (event?.type === "content_block_delta") {
          const delta = event.delta;
          if (delta?.type === "text_delta" && delta.text) {
            fullText += delta.text;
            write({ type: "text", content: delta.text });
          }
        }
      } else if ((msg as any).type === "assistant") {
        const content = (msg as any).message?.content;
        if (!fullText) {
          if (typeof content === "string") {
            fullText += content;
            write({ type: "text", content });
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "text" && block.text) {
                fullText += block.text;
                write({ type: "text", content: block.text });
              }
            }
          }
        }
      } else if ((msg as any).type === "result") {
        const r = (msg as any).result;
        if (!fullText && typeof r === "string" && r.trim()) {
          fullText = r;
          write({ type: "text", content: r });
        }
        break;
      } else if ((msg as any).type === "error") {
        write({ type: "error", message: (msg as any).error || "生成失败" });
        break;
      }
    }

    write({ type: "done", fullText });
    res.end();
  } catch (error: any) {
    console.error("[cases/promo]", error);
    write({ type: "error", message: error?.message || "生成失败" });
    res.end();
  } finally {
    closed = true;
    if (stream) await stream.interrupt().catch(() => undefined);
  }
});

// ============= 推广神器 API（基于 yanbot MCP 资讯数据） =============

const PROMO_PROMPT = `你是资深的考研/教育行业运营文案写手。请根据用户提供的【研bot 资讯素材】，撰写一段可直接发布到社交媒体或公众号的中文宣传文案。

要求：
1. 先给出一个有吸引力的标题（单独一行，以"标题："开头）。
2. 正文条理清晰、语气积极专业，突出资讯中的关键信息与价值点，引导读者关注。
3. 结尾可附 2~4 个相关话题标签（以 # 开头）。
4. 严格基于给定素材，不要杜撰院校名称、分数、日期等事实数据；素材信息不足时不要编造。
5. 直接输出文案正文，不要输出"好的""以下是"等多余说明，也不要使用代码块包裹。`;

function buildPromoMaterial(feeds: FeedItem[]): string {
  return feeds
    .map((f, i) => {
      const source = f.feedMeta?.title ? `（来源：${f.feedMeta.title}）` : "";
      const date = f.isoDate ? `\n发布时间：${f.isoDate}` : "";
      const tags = Array.isArray(f.tags) && f.tags.length ? `\n标签：${f.tags.join("、")}` : "";
      const bodyRaw = f.content || f.contentSnippet || f.summary || "";
      const body = bodyRaw ? `\n内容：${String(bodyRaw).slice(0, 800)}` : "";
      const link = f.link ? `\n原文链接：${f.link}` : "";
      return `【资讯 ${i + 1}】${f.title || "无标题"}${source}${date}${tags}${body}${link}`;
    })
    .join("\n\n");
}

// ============= 案例 → 小红书宣传文案 =============
const CASE_PROMO_PROMPT = `你是擅长写小红书爆款笔记的考研志愿规划博主。请根据用户提供的【志愿推荐案例数据】，写一篇可直接发布到小红书的种草笔记。

要求：
1. 开头一个吸睛标题（单独一行，以"标题："开头），可用 emoji 和"标题党"式表达制造点击欲。
2. 正文用 emoji 分点排版（每个要点前加合适的 emoji），口语化、有种草感，像真人分享上岸/择校经验。
3. 紧扣案例数据：突出考生画像（分数/专业/地区/院校层次）以及冲/稳/保候选院校、录取最低分、分差、985/211 等关键信息，帮读者直观感受"这个分能上什么"。
4. 结尾附 3~6 个以 # 开头的话题标签（如 #考研 #考研择校 #志愿填报 等）。
5. 严格基于给定数据，不要杜撰院校名称、分数、分差、年份等事实；数据不足处不要编造。
6. 直接输出笔记内容，不要输出"好的""以下是"等多余说明，也不要用代码块包裹。`;

interface CasePromoData {
  title?: string;
  candidateSummary?: string | null;
  note?: string | null;
  query?: {
    score?: number | null;
    subjectName?: string;
    provinceName?: string;
    level?: string | null;
    targetSchoolName?: string;
    year?: number | null;
  };
  result?: {
    note?: string;
    groups?: Array<{
      category?: string;
      items?: Array<{
        schoolName?: string;
        subjectName?: string;
        provinceName?: string;
        level?: string;
        year?: number;
        lowestScore?: number;
        averageScore?: number;
        scoreDiff?: number;
        tier?: string;
        is985?: boolean;
        is211?: boolean;
        isDualClass?: boolean;
      }>;
    }>;
  };
}

function buildCasePromoMaterial(data: CasePromoData): string {
  const MAX_PER_GROUP = 6;
  const q = data.query || {};
  const candidate = [
    q.score != null ? `总分≈${q.score}` : "",
    q.subjectName ? `专业「${q.subjectName}」` : "",
    q.provinceName ? `意向地区「${q.provinceName}」` : "",
    q.level ? `院校层次「${q.level}」` : "",
    q.targetSchoolName ? `目标院校「${q.targetSchoolName}」` : "",
    q.year ? `参考年份${q.year}` : "",
  ]
    .filter(Boolean)
    .join("，");

  const groups = (data.result?.groups || [])
    .map((g) => {
      const items = (g.items || []).slice(0, MAX_PER_GROUP);
      if (items.length === 0) return "";
      const lines = items
        .map((c, i) => {
          const labels = [
            c.isDualClass ? "双一流" : "",
            c.is985 ? "985" : "",
            c.is211 ? "211" : "",
          ].filter(Boolean).join("/");
          const parts = [
            `${i + 1}. ${c.schoolName || "未知院校"}`,
            c.subjectName ? `专业：${c.subjectName}` : "",
            c.tier ? `档位：${c.tier}` : "",
            typeof c.lowestScore === "number" ? `录取最低分：${c.lowestScore}` : "",
            typeof c.scoreDiff === "number"
              ? `分差：${c.scoreDiff >= 0 ? "+" + c.scoreDiff : c.scoreDiff}`
              : "",
            typeof c.averageScore === "number" && c.averageScore > 0 ? `平均分：${c.averageScore}` : "",
            c.year ? `年份：${c.year}` : "",
            labels ? `标签：${labels}` : "",
          ].filter(Boolean);
          return "  " + parts.join("，");
        })
        .join("\n");
      return `【${g.category || "候选"}候选】\n${lines}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const resultNote = data.result?.note ? `\n\n补充说明：${data.result.note}` : "";
  const caseNote = data.note ? `\n\n案例备注：${data.note}` : "";

  return [
    data.title ? `案例标题：${data.title}` : "",
    candidate ? `考生条件：${candidate}` : "考生条件：（未提供）",
    groups || "（暂无候选院校数据）",
  ]
    .filter(Boolean)
    .join("\n\n") + resultNote + caseNote;
}

// 资讯列表
app.get("/api/promo/feeds", requireAuth, async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Math.min(Number(req.query.pageSize) || 20, 100);
    const keyword = typeof req.query.keyword === "string" ? req.query.keyword : undefined;
    const data = await queryFeeds({ page, pageSize, keyword });
    res.json({ list: data.list || [], pagination: data.pagination });
  } catch (error: any) {
    console.error("[promo/feeds]", error);
    res.status(502).json({ error: error?.message || "获取资讯失败" });
  }
});

// 数据 tab：考研院校专业历年录取数据（筛选项）
app.get("/api/promo/scores/meta", requireAuth, async (req, res) => {
  try {
    await ensureMcpReady();
    const [years, levels] = await Promise.all([
      listScoreYears().catch(() => [] as number[]),
      listScoreLevels().catch(() => [] as string[]),
    ]);
    res.json({ years, levels });
  } catch (error: any) {
    console.error("[promo/scores/meta]", error);
    res.status(502).json({ error: error?.message || "获取筛选项失败" });
  }
});

// 数据 tab：考研院校专业历年录取分数线列表
app.get("/api/promo/scores", requireAuth, async (req, res) => {
  try {
    await ensureMcpReady();
    const q = req.query;
    const subjectRaw = typeof q.subject === "string" ? q.subject.trim() : "";
    const params: Parameters<typeof querySchoolScores>[0] = {
      schoolName: typeof q.schoolName === "string" ? q.schoolName : undefined,
      year: q.year ? Number(q.year) : undefined,
      level: typeof q.level === "string" ? q.level : undefined,
      studyForm: typeof q.studyForm === "string" ? q.studyForm : undefined,
      minLowestScore: q.minLowestScore ? Number(q.minLowestScore) : undefined,
      page: q.page ? Number(q.page) : 1,
      pageSize: Math.min(q.pageSize ? Number(q.pageSize) : 20, 50),
      sortBy: typeof q.sortBy === "string" ? q.sortBy : "lowestScore",
      sortOrder: q.sortOrder === "asc" ? "asc" : "desc",
    };
    // 专业：6 位数字按代码，否则按名称
    if (subjectRaw) {
      if (/^\d{6}$/.test(subjectRaw)) params.subjectCode = subjectRaw;
      else params.subjectName = subjectRaw;
    }
    const data = await querySchoolScores(params);
    res.json({ list: data.list || [], pagination: data.pagination });
  } catch (error: any) {
    console.error("[promo/scores]", error);
    res.status(502).json({ error: error?.message || "获取录取数据失败" });
  }
});

// 一键生成宣传文案（SSE 流式）
app.post("/api/promo/generate", requireAuth, async (req, res) => {
  const { feedIds, feedSnapshot, model } = (req.body || {}) as {
    feedIds?: string[];
    feedSnapshot?: FeedItem[];
    model?: string;
  };

  if (!Array.isArray(feedIds) || feedIds.length === 0) {
    return res.status(400).json({ error: "请至少选择一条资讯" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  let stream: ReturnType<typeof query> | null = null;
  let closed = false;
  const write = (obj: unknown) => {
    if (!closed) res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  try {
    await ensureMcpReady();
    let feeds = await getFeedsByIds(feedIds);
    // 兜底：MCP 未取到内容时用前端传来的快照
    if ((!feeds || feeds.length === 0) && Array.isArray(feedSnapshot) && feedSnapshot.length) {
      feeds = feedSnapshot;
    }
    if (!feeds || feeds.length === 0) {
      write({ type: "error", message: "未能获取选中的资讯内容，请重试" });
      return res.end();
    }

    const material = buildPromoMaterial(feeds);
    const selectedModel = model || defaultModel;

    stream = query({
      prompt: `【研bot 资讯素材】\n\n${material}\n\n请根据以上资讯撰写宣传文案。`,
      options: {
        cwd: process.cwd(),
        model: selectedModel,
        maxTurns: 1,
        permissionMode: "bypassPermissions",
        includePartialMessages: true,
        systemPrompt: PROMO_PROMPT,
        env: getSdkEnv(),
        stderr: (data: string) => console.log(`[promo/generate stderr] ${data.trim()}`),
      },
    });

    let fullText = "";
    write({ type: "init", feedCount: feeds.length, model: selectedModel });

    for await (const msg of stream) {
      if (closed) break;
      if ((msg as any).type === "stream_event") {
        const event = (msg as any).event;
        if (event?.type === "content_block_delta") {
          const delta = event.delta;
          if (delta?.type === "text_delta" && delta.text) {
            fullText += delta.text;
            write({ type: "text", content: delta.text });
          }
        }
      } else if ((msg as any).type === "assistant") {
        // 非流式回退：仅当 partial 未产出任何文本时使用
        const content = (msg as any).message?.content;
        if (!fullText) {
          if (typeof content === "string") {
            fullText += content;
            write({ type: "text", content });
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "text" && block.text) {
                fullText += block.text;
                write({ type: "text", content: block.text });
              }
            }
          }
        }
      } else if ((msg as any).type === "result") {
        const r = (msg as any).result;
        if (!fullText && typeof r === "string" && r.trim()) {
          fullText = r;
          write({ type: "text", content: r });
        }
        break;
      } else if ((msg as any).type === "error") {
        write({ type: "error", message: (msg as any).error || "生成失败" });
        break;
      }
    }

    write({ type: "done", fullText });
    res.end();
  } catch (error: any) {
    console.error("[promo/generate]", error);
    write({ type: "error", message: error?.message || "生成失败" });
    res.end();
  } finally {
    closed = true;
    if (stream) await stream.interrupt().catch(() => undefined);
  }
});

// 已保存文案：列表
app.get("/api/promo/copies", requireAuth, async (req, res) => {
  try {
    const rows = await db.getAllPromoCopies(req.user!.id);
    const copies = rows.map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      feedIds: r.feed_ids ? JSON.parse(r.feed_ids) : [],
      feedSnapshot: r.feed_snapshot ? JSON.parse(r.feed_snapshot) : [],
      favorite: !!r.favorite,
      createdAt: r.created_at,
    }));
    res.json({ copies });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "获取文案失败" });
  }
});

// 已保存文案：保存
app.post("/api/promo/copies", requireAuth, async (req, res) => {
  try {
    const { title, content, feedIds, feedSnapshot } = req.body || {};
    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: "文案内容为空" });
    }
    const now = new Date().toISOString();
    const item = {
      id: uuidv4(),
      user_id: req.user!.id,
      title: (title && String(title).slice(0, 100)) || "未命名文案",
      content: String(content),
      feed_ids: Array.isArray(feedIds) ? JSON.stringify(feedIds) : null,
      feed_snapshot: feedSnapshot ? JSON.stringify(feedSnapshot) : null,
      favorite: 0,
      created_at: now,
    };
    await db.createPromoCopy(item);
    res.json({ id: item.id, success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "保存失败" });
  }
});

// 已保存文案：切换收藏
app.patch("/api/promo/copies/:id", requireAuth, async (req, res) => {
  try {
    const { favorite } = req.body || {};
    await db.setPromoCopyFavorite(req.params.id, req.user!.id, !!favorite);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "更新失败" });
  }
});

// 已保存文案：删除
app.delete("/api/promo/copies/:id", requireAuth, async (req, res) => {
  try {
    await db.deletePromoCopy(req.params.id, req.user!.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "删除失败" });
  }
});

// ============= 前端静态托管 + SPA fallback =============
// 生产部署时由 Express 同源托管 Vite 构建产物 dist/，避免 CORS、简化部署。
const distDir = path.resolve(__dirname, "..", "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  // 非 /api 的路由一律回退到 index.html，交给前端路由处理（排除式正则，勿用 '*'）
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
  console.log(`[Static] 已启用前端静态托管: ${distDir}`);
} else {
  console.log(`[Static] 未找到 dist 目录，跳过静态托管（开发模式由 Vite 提供前端）`);
}

// 启动服务器
const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║                                            ║
║     ◉ API 服务器已启动                      ║
║                                            ║
║     地址: http://localhost:${PORT}            ║
║     数据库: SQLite (data/chat.db)          ║
║                                            ║
╚════════════════════════════════════════════╝
  `);
  console.log(`[ASR] 火山流式语音识别: ${isVolcAsrConfigured() ? "已配置" : "未配置（设置 VOLC_ASR_APP_KEY / VOLC_ASR_ACCESS_KEY 后启用）"}`);
});

// ============= 实时语音识别 WebSocket 代理 =============
// 浏览器(16k/16bit/mono PCM) ↔ 本代理 ↔ 火山双向流式 ASR；凭据仅驻留服务端。
const asrWss = new WebSocketServer({ server, path: "/api/asr" });
let asrConnSeq = 0;
asrWss.on("connection", (client: WebSocket) => {
  const connId = ++asrConnSeq;
  let audioFrames = 0;
  let audioBytes = 0;
  let transcripts = 0;
  console.log(`[ASR] #${connId} 浏览器已连接`);
  const send = (obj: Record<string, unknown>) => {
    if (client.readyState === client.OPEN) client.send(JSON.stringify(obj));
  };
  const session = createVolcAsrSession({
    onTranscript: (text, isFinal) => {
      transcripts += 1;
      // 避免刷屏：仅打印末包或每 10 条 partial
      if (isFinal || transcripts % 10 === 1) {
        console.log(`[ASR] #${connId} ${isFinal ? "final" : "partial"}: ${JSON.stringify(text.slice(0, 60))}`);
      }
      send({ type: isFinal ? "final" : "partial", text });
    },
    onError: (message) => {
      console.error(`[ASR] #${connId} 上游错误: ${message}`);
      send({ type: "error", message });
    },
    onClose: () => {
      console.log(`[ASR] #${connId} 上游关闭（共 ${audioFrames} 帧/${audioBytes}B 上行，${transcripts} 条转写）`);
      try {
        client.close();
      } catch {
        /* noop */
      }
    },
  });

  client.on("message", (data: Buffer, isBinary: boolean) => {
    if (isBinary) {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as any);
      audioFrames += 1;
      audioBytes += buf.length;
      if (audioFrames === 1 || audioFrames % 50 === 0) {
        console.log(`[ASR] #${connId} 收到音频帧 ${audioFrames}（累计 ${audioBytes}B）`);
      }
      session.sendAudio(buf);
    } else {
      // 控制消息：{ type: 'end' }
      try {
        const msg = JSON.parse(data.toString());
        if (msg?.type === "end") {
          console.log(`[ASR] #${connId} 收到 end，结束本次识别`);
          session.end();
        }
      } catch {
        /* 忽略非 JSON 控制帧 */
      }
    }
  });

  client.on("close", () => {
    console.log(`[ASR] #${connId} 浏览器断开`);
    session.end();
  });
  client.on("error", (e: any) => {
    console.error(`[ASR] #${connId} 浏览器连接错误: ${e?.message || e}`);
    session.end();
  });
});
