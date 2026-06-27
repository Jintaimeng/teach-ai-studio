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
import {
  querySchoolScore,
  getYears,
  isYanbotConfigured,
  YanbotApiError,
  type SchoolScoreRecord,
} from "./yanbotClient.js";

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

app.get("/api/mcp/config", (req, res) => {
  try {
    const content = fs.existsSync(mcpConfigPath)
      ? fs.readFileSync(mcpConfigPath, "utf-8")
      : JSON.stringify({ mcpServers: {} }, null, 2);

    res.json({ path: mcpConfigPath, content });
  } catch (error: any) {
    console.error("[MCP config] 读取失败:", error);
    res.status(500).json({ error: error?.message || "读取 MCP 配置失败" });
  }
});

app.put("/api/mcp/config", (req, res) => {
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

    const dir = path.dirname(mcpConfigPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(mcpConfigPath, JSON.stringify(parsed, null, 2), "utf-8");

    cachedMcpServers = loadMcpServers();
    cachedMcpInspect = null;
    lastMcpStatus = [];
    res.json({ success: true, path: mcpConfigPath });
  } catch (error: any) {
    console.error("[MCP config] 保存失败:", error);
    res.status(400).json({ error: error?.message || "保存 MCP 配置失败" });
  }
});

app.patch("/api/mcp/servers/:serverName", (req, res) => {
  try {
    const { serverName } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled 必须是布尔值" });
    }

    const parsed = fs.existsSync(mcpConfigPath)
      ? JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8")) as unknown
      : { mcpServers: {} };

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return res.status(400).json({ error: "mcp.json 必须是 JSON 对象" });
    }

    const configObject = parsed as McpConfigFile & Record<string, McpServerConfigWithDisabled>;
    const hasWrapper = "mcpServers" in configObject;
    const mcpServers = hasWrapper ? configObject.mcpServers : configObject;

    if (!mcpServers || typeof mcpServers !== "object" || Array.isArray(mcpServers)) {
      return res.status(400).json({ error: "mcpServers 必须是对象" });
    }

    const serverConfig = mcpServers[serverName];
    if (!serverConfig || typeof serverConfig !== "object" || Array.isArray(serverConfig)) {
      return res.status(404).json({ error: `未找到 MCP Server: ${serverName}` });
    }

    if (enabled) {
      delete serverConfig.disabled;
    } else {
      serverConfig.disabled = true;
    }

    const dir = path.dirname(mcpConfigPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(mcpConfigPath, JSON.stringify(parsed, null, 2), "utf-8");

    cachedMcpServers = loadMcpServers();
    cachedMcpInspect = null;
    lastMcpStatus = [];

    res.json({ success: true, name: serverName, enabled, path: mcpConfigPath });
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
app.get("/api/sessions", async (req, res) => {
  try {
    const sessions = await db.getAllSessions();
    const sessionsWithMessages = await Promise.all(
      sessions.map(async session => {
        const messages = await db.getMessagesBySession(session.id);
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
app.get("/api/sessions/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await db.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: "会话不存在" });
    }
    
    const messages = await db.getMessagesBySession(sessionId);
    
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
app.post("/api/sessions", async (req, res) => {
  try {
    const { model = defaultModel, title = "新对话" } = req.body;
    const now = new Date().toISOString();
    
    const session = await db.createSession({
      id: uuidv4(),
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
app.patch("/api/sessions/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { title, model } = req.body;
    
    const success = await db.updateSession(sessionId, { title, model });
    
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
app.delete("/api/sessions/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const success = await db.deleteSession(sessionId);
    
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
app.post("/api/chat", async (req, res) => {
  const { sessionId, message, model, systemPrompt, cwd, permissionMode } = req.body;
  
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
  let session = sessionId ? await db.getSession(sessionId) : null;
  const now = new Date().toISOString();
  
  if (!session) {
    // 创建新会话
    console.log(`[Chat] 创建新会话`);
    session = await db.createSession({
      id: sessionId || uuidv4(),
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
        ...(cachedMcpServers ? { mcpServers: cachedMcpServers, strictMcpConfig: false } : {}),
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
          await db.updateSession(session.id, { sdk_session_id: newSdkSessionId });
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
    const messages = await db.getMessagesBySession(session.id);
    if (messages.length <= 2) {
      await db.updateSession(session.id, { 
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

async function parseNlToQuery(message: string): Promise<ParsedQuery> {
  const model = process.env.RECOMMEND_MODEL || defaultModel;
  const stream = query({
    prompt: message,
    options: {
      cwd: process.cwd(),
      model,
      maxTurns: 1,
      permissionMode: "bypassPermissions",
      includePartialMessages: false,
      systemPrompt: RECOMMEND_PARSE_PROMPT,
      env: getSdkEnv(),
      stderr: (data: string) => console.log(`[Recommend parse stderr] ${data.trim()}`),
    },
  });

  let text = "";
  try {
    for await (const msg of stream) {
      if (msg.type === "assistant") {
        const content = (msg as any).message?.content;
        if (typeof content === "string") {
          text += content;
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text") text += block.text;
          }
        }
      } else if ((msg as any).type === "result") {
        const r = (msg as any).result;
        if (typeof r === "string" && r.trim()) text = r;
        break;
      }
    }
  } finally {
    await stream.interrupt().catch(() => undefined);
  }

  const parsed = extractJson(text) || {};
  const score = typeof parsed.score === "number" ? parsed.score : Number(parsed.score) || null;
  return {
    score,
    subjectName: parsed.subjectName || undefined,
    provinceName: parsed.provinceName || undefined,
    level: parsed.level || null,
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

async function runRecommendation(pq: ParsedQuery) {
  const year = await resolveYear(pq.year);
  const common: Record<string, string | number | boolean | undefined> = {
    subjectName: pq.subjectName,
    provinceName: pq.provinceName,
    level: pq.level || undefined,
    schoolName: pq.targetSchoolName,
    year,
    includeSchool: true,
  };

  const [firstData, adjustData] = await Promise.all([
    querySchoolScore({
      ...common,
      hasFirstChoice: true,
      minLowestScore: pq.band.firstMin,
      maxLowestScore: pq.band.firstMax,
      sortBy: "lowestScore",
      sortOrder: "desc",
      pageSize: 12,
    }),
    querySchoolScore({
      ...common,
      hasAdjustment: true,
      maxAdjustedLowestScore: pq.band.adjustMax,
      sortBy: "adjustedLowestScore",
      sortOrder: "desc",
      pageSize: 8,
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
app.post("/api/recommend", async (req, res) => {
  if (!isYanbotConfigured()) {
    return res.status(500).json({
      error: "未配置 yanbot 开放接口凭据，请在 .env 设置 OPEN_API_KEY 与 OPEN_API_SECRET 后重启服务",
    });
  }

  const { message, prevQuery, filterDelta } = req.body as {
    message?: string;
    prevQuery?: ParsedQuery;
    filterDelta?: FilterDelta;
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
      console.log(`[Recommend] 解析需求: ${message.slice(0, 80)}`);
      pq = await parseNlToQuery(message);
    }

    const result = await runRecommendation(pq);
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

app.get("/api/cases", async (req, res) => {
  try {
    const rows = await db.getAllFavoriteCases();
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

app.get("/api/cases/:id", async (req, res) => {
  try {
    const row = await db.getFavoriteCase(req.params.id);
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

app.post("/api/cases", async (req, res) => {
  try {
    const { title, candidateSummary, query: q, result, note } = req.body || {};
    if (!q || !result) {
      return res.status(400).json({ error: "缺少 query 或 result" });
    }
    const now = new Date().toISOString();
    const item = {
      id: uuidv4(),
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

app.delete("/api/cases/:id", async (req, res) => {
  try {
    await db.deleteFavoriteCase(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "删除失败" });
  }
});

// 启动服务器
app.listen(PORT, () => {
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
});
