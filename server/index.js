var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import "dotenv/config";
import express from "express";
import { query, unstable_v2_createSession, unstable_v2_authenticate } from "@tencent-ai/agent-sdk";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import * as db from "./db.js";
import { generateVibeReport } from "./services/school-report.js";
import { generateTiaojiReport } from "./services/tiaoji-report.js";
import { querySchoolScore, getYears, isYanbotConfigured, YanbotApiError, } from "./yanbotClient.js";
var execAsync = promisify(exec);
var pendingPermissions = new Map();
// 权限请求超时时间（5分钟）
var PERMISSION_TIMEOUT = 5 * 60 * 1000;
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var PORT = process.env.PORT || 3000;
// Middleware
app.use(express.json());
// 缓存可用模型列表
var cachedModels = [];
var defaultModel = "auto";
var mcpConfigPath = process.env.MCP_CONFIG_PATH
    ? path.resolve(process.env.MCP_CONFIG_PATH)
    : path.resolve(process.cwd(), "mcp.json");
var rawMcpConfig = {};
var cachedMcpServers;
var lastMcpStatus = [];
var lastAvailableSkills = [];
var cachedMcpInspect = null;
var MCP_INSPECT_CACHE_MS = 30000;
var MCP_INSPECT_TIMEOUT_MS = 15000;
var AUTH_VALIDATION_TIMEOUT_MS = 20000;
function getSdkEnv(overrides) {
    if (overrides === void 0) { overrides = {}; }
    return Object.fromEntries(Object.entries(__assign(__assign({ CODEBUDDY_API_KEY: process.env.CODEBUDDY_API_KEY, CODEBUDDY_AUTH_TOKEN: process.env.CODEBUDDY_AUTH_TOKEN, CODEBUDDY_INTERNET_ENVIRONMENT: process.env.CODEBUDDY_INTERNET_ENVIRONMENT || 'external', CODEBUDDY_BASE_URL: process.env.CODEBUDDY_BASE_URL }, overrides), { SERVER__PORT: '0' })).filter(function (_a) {
        var v = _a[1];
        return typeof v === 'string' && v.length > 0;
    }));
}
function getAuthErrorMessage(error) {
    if (Array.isArray(error === null || error === void 0 ? void 0 : error.errors) && error.errors.length > 0) {
        return error.errors.join('\n');
    }
    return (error === null || error === void 0 ? void 0 : error.message) || String(error);
}
function validateSdkAuth(env) {
    return __awaiter(this, void 0, void 0, function () {
        var abortController, validationQuery, timeout;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    abortController = new AbortController();
                    validationQuery = query({
                        options: {
                            cwd: process.cwd(),
                            maxTurns: 1,
                            permissionMode: 'bypassPermissions',
                            env: env,
                            abortController: abortController,
                            stderr: function (data) {
                                console.log("[Auth validation stderr] ".concat(data.trim()));
                            },
                        },
                    });
                    timeout = setTimeout(function () {
                        abortController.abort();
                    }, AUTH_VALIDATION_TIMEOUT_MS);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, , 3, 5]);
                    return [4 /*yield*/, validationQuery.accountInfo()];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 3:
                    clearTimeout(timeout);
                    return [4 /*yield*/, validationQuery.interrupt().catch(function () { return undefined; })];
                case 4:
                    _a.sent();
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function loadMcpServers() {
    try {
        if (!fs.existsSync(mcpConfigPath)) {
            console.log("[MCP] \u672A\u627E\u5230\u914D\u7F6E\u6587\u4EF6: ".concat(mcpConfigPath, "\uFF0C\u8DF3\u8FC7 MCP"));
            rawMcpConfig = {};
            cachedMcpInspect = null;
            return undefined;
        }
        var raw = fs.readFileSync(mcpConfigPath, "utf-8");
        var parsed = JSON.parse(raw);
        var mcpServers = parsed && typeof parsed === "object" && !Array.isArray(parsed) && "mcpServers" in parsed
            ? parsed.mcpServers
            : parsed;
        if (!mcpServers || typeof mcpServers !== "object" || Array.isArray(mcpServers)) {
            console.warn("[MCP] \u914D\u7F6E\u6587\u4EF6\u683C\u5F0F\u65E0\u6548: ".concat(mcpConfigPath));
            rawMcpConfig = {};
            cachedMcpInspect = null;
            return undefined;
        }
        rawMcpConfig = mcpServers;
        var enabledServers = Object.fromEntries(Object.entries(rawMcpConfig)
            .filter(function (_a) {
            var config = _a[1];
            return !config.disabled;
        })
            .map(function (_a) {
            var name = _a[0], config = _a[1];
            var disabled = config.disabled, sdkConfig = __rest(config, ["disabled"]);
            return [name, sdkConfig];
        }));
        cachedMcpInspect = null;
        console.log("[MCP] \u5DF2\u52A0\u8F7D ".concat(Object.keys(rawMcpConfig).length, " \u4E2A MCP Server \u914D\u7F6E\uFF0C\u542F\u7528 ").concat(Object.keys(enabledServers).length, " \u4E2A"));
        return Object.keys(enabledServers).length > 0 ? enabledServers : undefined;
    }
    catch (error) {
        console.error("[MCP] \u52A0\u8F7D\u914D\u7F6E\u5931\u8D25: ".concat((error === null || error === void 0 ? void 0 : error.message) || error));
        rawMcpConfig = {};
        cachedMcpInspect = null;
        return undefined;
    }
}
function serializeMcpConfigStatus() {
    return rawMcpConfig
        ? Object.entries(rawMcpConfig).map(function (_a) {
            var name = _a[0], config = _a[1];
            return ({ name: name, status: config.disabled ? "disabled" : "pending" });
        })
        : [];
}
function normalizeSlashCommands(commands) {
    if (!Array.isArray(commands))
        return [];
    return commands
        .map(function (command) {
        var _a;
        if (typeof command === "string") {
            return { name: command.replace(/^\//, ""), description: "", argumentHint: "" };
        }
        if (command && typeof command.name === "string") {
            return {
                name: command.name.replace(/^\//, ""),
                description: command.description || "",
                argumentHint: command.argumentHint || ((_a = command.input) === null || _a === void 0 ? void 0 : _a.hint) || "",
            };
        }
        return null;
    })
        .filter(function (command) { return Boolean(command); });
}
function mergeSkillsFromInit(message) {
    var skillCommands = normalizeSlashCommands(message.skills);
    var slashCommands = normalizeSlashCommands(message.slash_commands);
    var merged = new Map();
    __spreadArray(__spreadArray([], skillCommands, true), slashCommands, true).forEach(function (command) {
        merged.set(command.name, command);
    });
    return Array.from(merged.values());
}
function buildSystemPrompt(basePrompt, skills) {
    if (skills.length === 0) {
        return basePrompt;
    }
    var skillList = skills
        .map(function (skill) {
        var description = skill.description ? ": ".concat(skill.description) : "";
        var hint = skill.argumentHint ? " ".concat(skill.argumentHint) : "";
        return "- /".concat(skill.name).concat(hint).concat(description);
    })
        .join("\n");
    return "".concat(basePrompt, "\n\n\u53EF\u7528 Skill \u5982\u4E0B\u3002\u5F53\u7528\u6237\u610F\u56FE\u9002\u5408\u67D0\u4E2A Skill \u65F6\uFF0C\u8BF7\u4E3B\u52A8\u4F7F\u7528\u5BF9\u5E94\u7684 /skill \u547D\u4EE4\u89E6\u53D1\uFF0C\u4E0D\u8981\u8981\u6C42\u7528\u6237\u624B\u52A8\u8F93\u5165\u547D\u4EE4\uFF1A\n").concat(skillList);
}
function groupMcpTools(tools) {
    if (!Array.isArray(tools)) {
        return {};
    }
    var grouped = {};
    for (var _i = 0, tools_1 = tools; _i < tools_1.length; _i++) {
        var toolName = tools_1[_i];
        if (typeof toolName !== "string" || !toolName.startsWith("mcp__")) {
            continue;
        }
        var parts = toolName.slice("mcp__".length).split("__");
        var serverName = parts.shift();
        var tool = parts.join("__");
        if (!serverName || !tool) {
            continue;
        }
        if (!grouped[serverName]) {
            grouped[serverName] = new Set();
        }
        grouped[serverName].add(tool);
    }
    return Object.fromEntries(Object.entries(grouped).map(function (_a) {
        var serverName = _a[0], serverTools = _a[1];
        return [serverName, Array.from(serverTools).sort()];
    }));
}
function inspectMcpServers() {
    return __awaiter(this, arguments, void 0, function (force) {
        var now, stream, timeout, _a, stream_1, stream_1_1, msg, initMessage, status_1, toolsByServer, e_1_1, error_1;
        var _b, e_1, _c, _d;
        if (force === void 0) { force = false; }
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    now = Date.now();
                    if (!force && cachedMcpInspect && now - cachedMcpInspect.inspectedAt < MCP_INSPECT_CACHE_MS) {
                        return [2 /*return*/, cachedMcpInspect];
                    }
                    if (!cachedMcpServers || Object.keys(cachedMcpServers).length === 0) {
                        cachedMcpInspect = { status: [], toolsByServer: {}, inspectedAt: now };
                        return [2 /*return*/, cachedMcpInspect];
                    }
                    stream = query({
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
                            stderr: function (data) {
                                console.log("[MCP inspect stderr] ".concat(data.trim()));
                            },
                        }
                    });
                    timeout = setTimeout(function () {
                        stream.interrupt().catch(function () { return undefined; });
                    }, MCP_INSPECT_TIMEOUT_MS);
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 15, 16, 17]);
                    _e.label = 2;
                case 2:
                    _e.trys.push([2, 8, 9, 14]);
                    _a = true, stream_1 = __asyncValues(stream);
                    _e.label = 3;
                case 3: return [4 /*yield*/, stream_1.next()];
                case 4:
                    if (!(stream_1_1 = _e.sent(), _b = stream_1_1.done, !_b)) return [3 /*break*/, 7];
                    _d = stream_1_1.value;
                    _a = false;
                    msg = _d;
                    if (!(msg.type === "system" && msg.subtype === "init")) return [3 /*break*/, 6];
                    initMessage = msg;
                    status_1 = Array.isArray(initMessage.mcp_servers) ? initMessage.mcp_servers : [];
                    toolsByServer = groupMcpTools(initMessage.tools);
                    lastMcpStatus = status_1;
                    cachedMcpInspect = {
                        status: status_1,
                        toolsByServer: toolsByServer,
                        inspectedAt: Date.now(),
                    };
                    return [4 /*yield*/, stream.interrupt().catch(function () { return undefined; })];
                case 5:
                    _e.sent();
                    return [2 /*return*/, cachedMcpInspect];
                case 6:
                    _a = true;
                    return [3 /*break*/, 3];
                case 7: return [3 /*break*/, 14];
                case 8:
                    e_1_1 = _e.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 14];
                case 9:
                    _e.trys.push([9, , 12, 13]);
                    if (!(!_a && !_b && (_c = stream_1.return))) return [3 /*break*/, 11];
                    return [4 /*yield*/, _c.call(stream_1)];
                case 10:
                    _e.sent();
                    _e.label = 11;
                case 11: return [3 /*break*/, 13];
                case 12:
                    if (e_1) throw e_1.error;
                    return [7 /*endfinally*/];
                case 13: return [7 /*endfinally*/];
                case 14: return [3 /*break*/, 17];
                case 15:
                    error_1 = _e.sent();
                    console.error("[MCP inspect] \u5DE1\u68C0\u5931\u8D25: ".concat((error_1 === null || error_1 === void 0 ? void 0 : error_1.message) || error_1));
                    return [3 /*break*/, 17];
                case 16:
                    clearTimeout(timeout);
                    return [7 /*endfinally*/];
                case 17:
                    cachedMcpInspect = {
                        status: lastMcpStatus,
                        toolsByServer: {},
                        inspectedAt: Date.now(),
                    };
                    return [2 /*return*/, cachedMcpInspect];
            }
        });
    });
}
function buildMcpServerList(inspect) {
    var statusByName = new Map(inspect.status.map(function (server) { return [server.name, server.status]; }));
    return Object.entries(rawMcpConfig).map(function (_a) {
        var name = _a[0], config = _a[1];
        var enabled = !config.disabled;
        var status = enabled ? (statusByName.get(name) || "pending") : "disabled";
        return {
            name: name,
            type: config.type || "stdio",
            enabled: enabled,
            status: status,
            tools: (inspect.toolsByServer[name] || []).map(function (toolName) { return ({ name: toolName }); }),
        };
    });
}
cachedMcpServers = loadMcpServers();
// 健康检查
app.get("/api/health", function (req, res) {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
app.get("/api/mcp-status", function (req, res) {
    res.json({
        configPath: mcpConfigPath,
        configured: serializeMcpConfigStatus(),
        status: lastMcpStatus,
    });
});
app.get("/api/mcp/config", function (req, res) {
    try {
        var content = fs.existsSync(mcpConfigPath)
            ? fs.readFileSync(mcpConfigPath, "utf-8")
            : JSON.stringify({ mcpServers: {} }, null, 2);
        res.json({ path: mcpConfigPath, content: content });
    }
    catch (error) {
        console.error("[MCP config] 读取失败:", error);
        res.status(500).json({ error: (error === null || error === void 0 ? void 0 : error.message) || "读取 MCP 配置失败" });
    }
});
app.put("/api/mcp/config", function (req, res) {
    try {
        var content = req.body.content;
        if (typeof content !== "string") {
            return res.status(400).json({ error: "content 必须是字符串" });
        }
        var parsed = JSON.parse(content);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return res.status(400).json({ error: "mcp.json 必须是 JSON 对象" });
        }
        var mcpServers = "mcpServers" in parsed ? parsed.mcpServers : parsed;
        if (!mcpServers || typeof mcpServers !== "object" || Array.isArray(mcpServers)) {
            return res.status(400).json({ error: "mcpServers 必须是对象" });
        }
        var dir = path.dirname(mcpConfigPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(mcpConfigPath, JSON.stringify(parsed, null, 2), "utf-8");
        cachedMcpServers = loadMcpServers();
        cachedMcpInspect = null;
        lastMcpStatus = [];
        res.json({ success: true, path: mcpConfigPath });
    }
    catch (error) {
        console.error("[MCP config] 保存失败:", error);
        res.status(400).json({ error: (error === null || error === void 0 ? void 0 : error.message) || "保存 MCP 配置失败" });
    }
});
app.patch("/api/mcp/servers/:serverName", function (req, res) {
    try {
        var serverName = req.params.serverName;
        var enabled = req.body.enabled;
        if (typeof enabled !== "boolean") {
            return res.status(400).json({ error: "enabled 必须是布尔值" });
        }
        var parsed = fs.existsSync(mcpConfigPath)
            ? JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"))
            : { mcpServers: {} };
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return res.status(400).json({ error: "mcp.json 必须是 JSON 对象" });
        }
        var configObject = parsed;
        var hasWrapper = "mcpServers" in configObject;
        var mcpServers = hasWrapper ? configObject.mcpServers : configObject;
        if (!mcpServers || typeof mcpServers !== "object" || Array.isArray(mcpServers)) {
            return res.status(400).json({ error: "mcpServers 必须是对象" });
        }
        var serverConfig = mcpServers[serverName];
        if (!serverConfig || typeof serverConfig !== "object" || Array.isArray(serverConfig)) {
            return res.status(404).json({ error: "\u672A\u627E\u5230 MCP Server: ".concat(serverName) });
        }
        if (enabled) {
            delete serverConfig.disabled;
        }
        else {
            serverConfig.disabled = true;
        }
        var dir = path.dirname(mcpConfigPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(mcpConfigPath, JSON.stringify(parsed, null, 2), "utf-8");
        cachedMcpServers = loadMcpServers();
        cachedMcpInspect = null;
        lastMcpStatus = [];
        res.json({ success: true, name: serverName, enabled: enabled, path: mcpConfigPath });
    }
    catch (error) {
        console.error("[MCP server] 切换失败:", error);
        res.status(400).json({ error: (error === null || error === void 0 ? void 0 : error.message) || "切换 MCP Server 失败" });
    }
});
app.get("/api/mcp/servers", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var force, inspect, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                force = req.query.force === "1" || req.query.force === "true";
                return [4 /*yield*/, inspectMcpServers(force)];
            case 1:
                inspect = _a.sent();
                res.json({
                    configPath: mcpConfigPath,
                    servers: buildMcpServerList(inspect),
                });
                return [3 /*break*/, 3];
            case 2:
                error_2 = _a.sent();
                console.error("[MCP servers] 获取失败:", error_2);
                res.status(500).json({ error: (error_2 === null || error_2 === void 0 ? void 0 : error_2.message) || "获取 MCP 列表失败" });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// 启动日志
console.log("[Server] ========== \u73AF\u5883\u914D\u7F6E ==========");
console.log("[Server] CODEBUDDY_API_KEY: ".concat(process.env.CODEBUDDY_API_KEY ? '已设置 (' + process.env.CODEBUDDY_API_KEY.slice(0, 8) + '****)' : '⚠️ 未设置'));
console.log("[Server] CODEBUDDY_AUTH_TOKEN: ".concat(process.env.CODEBUDDY_AUTH_TOKEN ? '已设置' : '未设置'));
console.log("[Server] CODEBUDDY_INTERNET_ENVIRONMENT: ".concat(process.env.CODEBUDDY_INTERNET_ENVIRONMENT || '未设置（将默认 external）'));
console.log("[Server] WORKING_DIR: ".concat(process.cwd()));
console.log("[Server] ================================\n");
// 检查 CodeBuddy CLI 登录状态
app.get("/api/check-login", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var response, apiKey, authToken, internetEnv, baseUrl, needsLogin_1, result, error_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                response = {
                    isLoggedIn: false,
                    envConfigured: false,
                    cliConfigured: false,
                    envVars: {},
                };
                apiKey = process.env.CODEBUDDY_API_KEY;
                authToken = process.env.CODEBUDDY_AUTH_TOKEN;
                internetEnv = process.env.CODEBUDDY_INTERNET_ENVIRONMENT;
                baseUrl = process.env.CODEBUDDY_BASE_URL;
                if (apiKey || authToken) {
                    response.envConfigured = true;
                    // 脱敏显示
                    if (apiKey) {
                        response.envVars.apiKey = apiKey.slice(0, 8) + '****' + apiKey.slice(-4);
                        response.apiKey = response.envVars.apiKey;
                    }
                    if (authToken) {
                        response.envVars.authToken = authToken.slice(0, 8) + '****' + authToken.slice(-4);
                    }
                    if (internetEnv) {
                        response.envVars.internetEnv = internetEnv;
                    }
                    if (baseUrl) {
                        response.envVars.baseUrl = baseUrl;
                    }
                }
                if (!response.envConfigured) return [3 /*break*/, 1];
                response.isLoggedIn = true;
                response.method = 'env';
                console.log('[Check Login] 环境变量已配置，跳过 CLI 认证检查');
                return [3 /*break*/, 4];
            case 1:
                _a.trys.push([1, 3, , 4]);
                needsLogin_1 = false;
                return [4 /*yield*/, unstable_v2_authenticate({
                        environment: 'external',
                        onAuthUrl: function (authState) { return __awaiter(void 0, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                needsLogin_1 = true;
                                console.log('[Check Login] 需要登录，认证 URL:', authState.authUrl);
                                response.error = '未登录，请先登录 CodeBuddy CLI';
                                return [2 /*return*/];
                            });
                        }); },
                        // 传入 env 避免 CLI 端口冲突（SERVER__PORT=0）
                        env: {
                            SERVER__PORT: '0',
                        },
                        timeout: 15000, // 15 秒超时，避免 UI 长时间挂起
                    })];
            case 2:
                result = _a.sent();
                if (!needsLogin_1 && (result === null || result === void 0 ? void 0 : result.userinfo)) {
                    response.isLoggedIn = true;
                    response.cliConfigured = true;
                    response.method = 'cli';
                    console.log('[Check Login] CLI 已登录:', result.userinfo.userName);
                }
                else if (!needsLogin_1) {
                    response.isLoggedIn = true;
                    response.cliConfigured = true;
                    response.method = 'cli';
                }
                return [3 /*break*/, 4];
            case 3:
                error_3 = _a.sent();
                console.error("[Check Login] CLI 检查失败:", (error_3 === null || error_3 === void 0 ? void 0 : error_3.message) || error_3);
                response.error = (error_3 === null || error_3 === void 0 ? void 0 : error_3.message) || String(error_3);
                response.method = 'none';
                return [3 /*break*/, 4];
            case 4:
                res.json(response);
                return [2 /*return*/];
        }
    });
}); });
// 保存环境变量配置
app.post("/api/save-env-config", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var apiKey, authToken, internetEnv, baseUrl, envUpdates, validationEnv, error_4, message, configuredVars;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                apiKey = typeof req.body.apiKey === 'string' ? req.body.apiKey.trim() : '';
                authToken = typeof req.body.authToken === 'string' ? req.body.authToken.trim() : '';
                internetEnv = typeof req.body.internetEnv === 'string' ? req.body.internetEnv.trim() : '';
                baseUrl = typeof req.body.baseUrl === 'string' ? req.body.baseUrl.trim() : '';
                if (!apiKey && !authToken) {
                    return [2 /*return*/, res.status(400).json({ error: '请至少配置 API Key 或 Auth Token' })];
                }
                envUpdates = {
                    CODEBUDDY_API_KEY: apiKey || undefined,
                    CODEBUDDY_AUTH_TOKEN: authToken || undefined,
                    CODEBUDDY_INTERNET_ENVIRONMENT: internetEnv || 'external',
                    CODEBUDDY_BASE_URL: baseUrl || undefined,
                };
                validationEnv = getSdkEnv(envUpdates);
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, validateSdkAuth(validationEnv)];
            case 2:
                _a.sent();
                return [3 /*break*/, 4];
            case 3:
                error_4 = _a.sent();
                message = getAuthErrorMessage(error_4);
                console.error("[Save Env] \u8BA4\u8BC1\u6821\u9A8C\u5931\u8D25:", message);
                return [2 /*return*/, res.status(401).json({
                        success: false,
                        error: "\u8BA4\u8BC1\u5931\u8D25\uFF1A".concat(message),
                    })];
            case 4:
                configuredVars = [];
                // 校验通过后，替换当前进程内的认证环境变量。
                if (apiKey) {
                    process.env.CODEBUDDY_API_KEY = apiKey;
                    configuredVars.push('CODEBUDDY_API_KEY');
                }
                else {
                    delete process.env.CODEBUDDY_API_KEY;
                }
                if (authToken) {
                    process.env.CODEBUDDY_AUTH_TOKEN = authToken;
                    configuredVars.push('CODEBUDDY_AUTH_TOKEN');
                }
                else {
                    delete process.env.CODEBUDDY_AUTH_TOKEN;
                }
                if (internetEnv) {
                    process.env.CODEBUDDY_INTERNET_ENVIRONMENT = internetEnv;
                    configuredVars.push('CODEBUDDY_INTERNET_ENVIRONMENT');
                }
                else {
                    // 默认设为 external
                    process.env.CODEBUDDY_INTERNET_ENVIRONMENT = 'external';
                }
                if (baseUrl) {
                    process.env.CODEBUDDY_BASE_URL = baseUrl;
                    configuredVars.push('CODEBUDDY_BASE_URL');
                }
                else {
                    delete process.env.CODEBUDDY_BASE_URL;
                }
                // 清除模型缓存，以便重新获取
                cachedModels = [];
                res.json({
                    success: true,
                    message: "\u5DF2\u8BBE\u7F6E: ".concat(configuredVars.join(', ')),
                    note: '环境变量仅在当前服务器进程有效，重启后需要重新设置'
                });
                return [2 /*return*/];
        }
    });
}); });
// 获取可用模型列表
app.get("/api/models", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var session, models, error_5;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 4, , 5]);
                if (!(cachedModels.length === 0)) return [3 /*break*/, 3];
                console.log("[Models] Creating session to fetch available models...");
                return [4 /*yield*/, unstable_v2_createSession({
                        cwd: process.cwd()
                    })];
            case 1:
                session = _a.sent();
                console.log("[Models] Session created, calling getAvailableModels()...");
                return [4 /*yield*/, session.getAvailableModels()];
            case 2:
                models = _a.sent();
                console.log("[Models] Got", models.length, "models");
                if (models && Array.isArray(models)) {
                    cachedModels = models;
                }
                _a.label = 3;
            case 3:
                res.json({
                    models: cachedModels.length > 0 ? cachedModels : [
                        { modelId: "auto", name: "Auto (自动选择)" },
                        { modelId: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
                        { modelId: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
                        { modelId: "glm-5.2", name: "GLM 5.2" },
                        { modelId: "kimi-k2.7", name: "Kimi K2.7" },
                        { modelId: "minimax-m3", name: "MiniMax M3" },
                    ],
                    defaultModel: defaultModel
                });
                return [3 /*break*/, 5];
            case 4:
                error_5 = _a.sent();
                console.error("[Models] Error:", error_5);
                res.json({
                    models: [
                        { modelId: "auto", name: "Auto (自动选择)" },
                        { modelId: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
                    ],
                    defaultModel: defaultModel,
                    error: (error_5 === null || error_5 === void 0 ? void 0 : error_5.message) || String(error_5)
                });
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
// ============= 会话 API =============
// 获取所有会话（包含消息数量）
app.get("/api/sessions", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var sessions, sessionsWithMessages, error_6;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                return [4 /*yield*/, db.getAllSessions()];
            case 1:
                sessions = _a.sent();
                return [4 /*yield*/, Promise.all(sessions.map(function (session) { return __awaiter(void 0, void 0, void 0, function () {
                        var messages;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, db.getMessagesBySession(session.id)];
                                case 1:
                                    messages = _a.sent();
                                    return [2 /*return*/, __assign(__assign({}, session), { messageCount: messages.length })];
                            }
                        });
                    }); }))];
            case 2:
                sessionsWithMessages = _a.sent();
                res.json({ sessions: sessionsWithMessages });
                return [3 /*break*/, 4];
            case 3:
                error_6 = _a.sent();
                console.error("[Sessions] Error:", error_6);
                res.status(500).json({ error: (error_6 === null || error_6 === void 0 ? void 0 : error_6.message) || "获取会话失败" });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// 获取单个会话及其消息
app.get("/api/sessions/:sessionId", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var sessionId, session, messages, parsedMessages, error_7;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                sessionId = req.params.sessionId;
                return [4 /*yield*/, db.getSession(sessionId)];
            case 1:
                session = _a.sent();
                if (!session) {
                    return [2 /*return*/, res.status(404).json({ error: "会话不存在" })];
                }
                return [4 /*yield*/, db.getMessagesBySession(sessionId)];
            case 2:
                messages = _a.sent();
                parsedMessages = messages.map(function (msg) { return (__assign(__assign({}, msg), { tool_calls: msg.tool_calls ? JSON.parse(msg.tool_calls) : null })); });
                res.json({ session: session, messages: parsedMessages });
                return [3 /*break*/, 4];
            case 3:
                error_7 = _a.sent();
                console.error("[Session] Error:", error_7);
                res.status(500).json({ error: (error_7 === null || error_7 === void 0 ? void 0 : error_7.message) || "获取会话失败" });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// 创建新会话
app.post("/api/sessions", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, _b, model, _c, title, now, session, error_8;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                _d.trys.push([0, 2, , 3]);
                _a = req.body, _b = _a.model, model = _b === void 0 ? defaultModel : _b, _c = _a.title, title = _c === void 0 ? "新对话" : _c;
                now = new Date().toISOString();
                return [4 /*yield*/, db.createSession({
                        id: uuidv4(),
                        title: title,
                        model: model,
                        sdk_session_id: null,
                        created_at: now,
                        updated_at: now
                    })];
            case 1:
                session = _d.sent();
                res.json({ session: session });
                return [3 /*break*/, 3];
            case 2:
                error_8 = _d.sent();
                console.error("[Create Session] Error:", error_8);
                res.status(500).json({ error: (error_8 === null || error_8 === void 0 ? void 0 : error_8.message) || "创建会话失败" });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// 更新会话
app.patch("/api/sessions/:sessionId", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var sessionId, _a, title, model, success, error_9;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                sessionId = req.params.sessionId;
                _a = req.body, title = _a.title, model = _a.model;
                return [4 /*yield*/, db.updateSession(sessionId, { title: title, model: model })];
            case 1:
                success = _b.sent();
                if (!success) {
                    return [2 /*return*/, res.status(404).json({ error: "会话不存在" })];
                }
                res.json({ success: true });
                return [3 /*break*/, 3];
            case 2:
                error_9 = _b.sent();
                console.error("[Update Session] Error:", error_9);
                res.status(500).json({ error: (error_9 === null || error_9 === void 0 ? void 0 : error_9.message) || "更新会话失败" });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// 删除会话
app.delete("/api/sessions/:sessionId", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var sessionId, success, error_10;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                sessionId = req.params.sessionId;
                return [4 /*yield*/, db.deleteSession(sessionId)];
            case 1:
                success = _a.sent();
                if (!success) {
                    return [2 /*return*/, res.status(404).json({ error: "会话不存在" })];
                }
                res.json({ success: true });
                return [3 /*break*/, 3];
            case 2:
                error_10 = _a.sent();
                console.error("[Delete Session] Error:", error_10);
                res.status(500).json({ error: (error_10 === null || error_10 === void 0 ? void 0 : error_10.message) || "删除会话失败" });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// ============= 聊天 API =============
// 权限响应 API
app.post("/api/permission-response", function (req, res) {
    var _a = req.body, requestId = _a.requestId, behavior = _a.behavior, message = _a.message;
    console.log("[Permission] Response received: requestId=".concat(requestId, ", behavior=").concat(behavior));
    var pending = pendingPermissions.get(requestId);
    if (!pending) {
        console.log("[Permission] Request not found: ".concat(requestId));
        return res.status(404).json({ error: "权限请求不存在或已超时" });
    }
    // 清除请求
    pendingPermissions.delete(requestId);
    if (behavior === 'allow') {
        pending.resolve({
            behavior: 'allow',
            updatedInput: pending.input
        });
    }
    else {
        pending.resolve({
            behavior: 'deny',
            message: message || '用户拒绝了此操作'
        });
    }
    res.json({ success: true });
});
// 发送消息并获取流式响应
app.post("/api/chat", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, sessionId, message, model, systemPrompt, cwd, permissionMode, session, _b, now, selectedModel, sdkSessionId, userMessageId, assistantMessageId, dbError_1, defaultSystemPrompt, finalSystemPrompt, workingDir, streamTimeoutChecker, streamClosed, streamLastActivity, activePermissionRequests, activePermissionRequestIds, abortController, stream, closeStream, canUseTool, fullResponse, toolCalls, newSdkSessionId, currentToolId, STREAM_TIMEOUT_MS_1, _loop_1, _c, stream_2, stream_2_1, state_1, e_2_1, messages, error_11, errorMessage;
    var _d, e_2, _e, _f;
    var _g;
    return __generator(this, function (_h) {
        switch (_h.label) {
            case 0:
                _a = req.body, sessionId = _a.sessionId, message = _a.message, model = _a.model, systemPrompt = _a.systemPrompt, cwd = _a.cwd, permissionMode = _a.permissionMode;
                // 请求日志
                console.log("\n[Chat] ========== \u65B0\u8BF7\u6C42 ==========");
                console.log("[Chat] SessionId: ".concat(sessionId));
                console.log("[Chat] Model: ".concat(model));
                console.log("[Chat] Message: ".concat(message === null || message === void 0 ? void 0 : message.slice(0, 100)).concat((message === null || message === void 0 ? void 0 : message.length) > 100 ? '...' : ''));
                console.log("[Chat] CWD: ".concat(cwd || 'default'));
                if (!message) {
                    console.log("[Chat] \u9519\u8BEF: \u6D88\u606F\u4E3A\u7A7A");
                    return [2 /*return*/, res.status(400).json({ error: "消息不能为空" })];
                }
                if (!sessionId) return [3 /*break*/, 2];
                return [4 /*yield*/, db.getSession(sessionId)];
            case 1:
                _b = _h.sent();
                return [3 /*break*/, 3];
            case 2:
                _b = null;
                _h.label = 3;
            case 3:
                session = _b;
                now = new Date().toISOString();
                if (!!session) return [3 /*break*/, 5];
                // 创建新会话
                console.log("[Chat] \u521B\u5EFA\u65B0\u4F1A\u8BDD");
                return [4 /*yield*/, db.createSession({
                        id: sessionId || uuidv4(),
                        title: message.slice(0, 30) + (message.length > 30 ? '...' : ''),
                        model: model || defaultModel,
                        sdk_session_id: null, // 稍后从 SDK 获取
                        created_at: now,
                        updated_at: now
                    })];
            case 4:
                session = _h.sent();
                return [3 /*break*/, 6];
            case 5:
                console.log("[Chat] \u4F7F\u7528\u73B0\u6709\u4F1A\u8BDD, SDK Session: ".concat(session.sdk_session_id || 'none'));
                _h.label = 6;
            case 6:
                selectedModel = model || session.model;
                sdkSessionId = session.sdk_session_id;
                userMessageId = uuidv4();
                assistantMessageId = uuidv4();
                _h.label = 7;
            case 7:
                _h.trys.push([7, 9, , 10]);
                return [4 /*yield*/, db.createMessage({
                        id: userMessageId,
                        session_id: session.id,
                        role: 'user',
                        content: message,
                        model: null,
                        created_at: now,
                        tool_calls: null
                    })];
            case 8:
                _h.sent();
                console.log("[Chat] \u7528\u6237\u6D88\u606F\u5DF2\u4FDD\u5B58: ".concat(userMessageId));
                return [3 /*break*/, 10];
            case 9:
                dbError_1 = _h.sent();
                console.error("[Chat] \u4FDD\u5B58\u7528\u6237\u6D88\u606F\u5931\u8D25:", dbError_1);
                return [2 /*return*/, res.status(500).json({ error: "保存消息失败", detail: dbError_1 === null || dbError_1 === void 0 ? void 0 : dbError_1.message })];
            case 10:
                // 设置 SSE 头
                res.setHeader("Content-Type", "text/event-stream");
                res.setHeader("Cache-Control", "no-cache");
                res.setHeader("Connection", "keep-alive");
                defaultSystemPrompt = "你是一个专业的AI助手，善于帮助用户解决各种问题。请用简洁清晰的方式回答问题。";
                finalSystemPrompt = buildSystemPrompt(systemPrompt || defaultSystemPrompt, lastAvailableSkills);
                workingDir = cwd || process.cwd();
                streamClosed = false;
                streamLastActivity = Date.now();
                activePermissionRequests = 0;
                activePermissionRequestIds = new Set();
                abortController = new AbortController();
                closeStream = function (reason) { return __awaiter(void 0, void 0, void 0, function () {
                    var _i, _a, requestId, pending, error_12;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                if (streamClosed)
                                    return [2 /*return*/];
                                console.log("[Chat] Closing stream: ".concat(reason));
                                streamClosed = true;
                                abortController.abort();
                                for (_i = 0, _a = Array.from(activePermissionRequestIds); _i < _a.length; _i++) {
                                    requestId = _a[_i];
                                    pending = pendingPermissions.get(requestId);
                                    if (pending) {
                                        pendingPermissions.delete(requestId);
                                        pending.resolve({
                                            behavior: 'deny',
                                            message: reason,
                                        });
                                    }
                                }
                                activePermissionRequestIds.clear();
                                _b.label = 1;
                            case 1:
                                _b.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, (stream === null || stream === void 0 ? void 0 : stream.interrupt())];
                            case 2:
                                _b.sent();
                                return [3 /*break*/, 4];
                            case 3:
                                error_12 = _b.sent();
                                console.warn("[Chat] Failed to interrupt stream: ".concat((error_12 === null || error_12 === void 0 ? void 0 : error_12.message) || error_12));
                                return [3 /*break*/, 4];
                            case 4: return [2 /*return*/];
                        }
                    });
                }); };
                res.on('close', function () {
                    if (!streamClosed) {
                        closeStream('客户端已停止输出').catch(function (error) {
                            console.warn("[Chat] Close cleanup failed: ".concat((error === null || error === void 0 ? void 0 : error.message) || error));
                        });
                    }
                });
                _h.label = 11;
            case 11:
                _h.trys.push([11, 29, , 30]);
                console.log("[Chat] \u8C03\u7528 SDK query...");
                console.log("[Chat] - Model: ".concat(selectedModel));
                console.log("[Chat] - Resume: ".concat(sdkSessionId || 'none'));
                console.log("[Chat] - CWD: ".concat(workingDir));
                console.log("[Chat] - PermissionMode: ".concat(permissionMode || 'default'));
                console.log("[Chat] - API Key: ".concat(process.env.CODEBUDDY_API_KEY ? 'YES (' + process.env.CODEBUDDY_API_KEY.slice(0, 8) + '****)' : 'NO ⚠️'));
                console.log("[Chat] - Message length: ".concat(message.length, " chars"));
                console.log("[Chat] - MCP Servers: ".concat(cachedMcpServers ? Object.keys(cachedMcpServers).join(', ') : 'none'));
                console.log("[Chat] - Cached Skills: ".concat(lastAvailableSkills.length));
                canUseTool = function (toolName, input, options) { return __awaiter(void 0, void 0, void 0, function () {
                    var requestId, permissionRequest;
                    return __generator(this, function (_a) {
                        console.log("[Permission] Tool request: ".concat(toolName));
                        console.log("[Permission] Input:", JSON.stringify(input, null, 2));
                        // bypassPermissions 模式直接放行
                        if (permissionMode === 'bypassPermissions') {
                            console.log("[Permission] Bypassing permissions for ".concat(toolName));
                            return [2 /*return*/, { behavior: 'allow', updatedInput: input }];
                        }
                        requestId = uuidv4();
                        permissionRequest = {
                            requestId: requestId,
                            toolUseId: options.toolUseID,
                            toolName: toolName,
                            input: input,
                            sessionId: session.id,
                            timestamp: Date.now()
                        };
                        // 发送权限请求到前端
                        res.write("data: ".concat(JSON.stringify(__assign({ type: "permission_request" }, permissionRequest)), "\n\n"));
                        streamLastActivity = Date.now();
                        activePermissionRequests += 1;
                        // 创建 Promise 等待用户响应
                        return [2 /*return*/, new Promise(function (resolve, reject) {
                                var pending = {
                                    resolve: resolve,
                                    reject: reject,
                                    toolName: toolName,
                                    input: input,
                                    sessionId: session.id,
                                    timestamp: Date.now()
                                };
                                pendingPermissions.set(requestId, pending);
                                activePermissionRequestIds.add(requestId);
                                // 设置超时
                                setTimeout(function () {
                                    if (pendingPermissions.has(requestId)) {
                                        pendingPermissions.delete(requestId);
                                        activePermissionRequestIds.delete(requestId);
                                        console.log("[Permission] Request timeout: ".concat(requestId));
                                        resolve({
                                            behavior: 'deny',
                                            message: '权限请求超时'
                                        });
                                    }
                                }, PERMISSION_TIMEOUT);
                            }).finally(function () {
                                activePermissionRequestIds.delete(requestId);
                                activePermissionRequests = Math.max(0, activePermissionRequests - 1);
                                streamLastActivity = Date.now();
                            })];
                    });
                }); };
                // 使用 Query API 发送消息
                // 如果有 sdk_session_id，使用 resume 恢复对话上下文
                stream = query({
                    prompt: message,
                    options: __assign(__assign(__assign({ cwd: workingDir, model: selectedModel, maxTurns: 10, systemPrompt: finalSystemPrompt, permissionMode: permissionMode || 'default', canUseTool: canUseTool, includePartialMessages: true, settingSources: ['user', 'project'], abortController: abortController }, (cachedMcpServers ? { mcpServers: cachedMcpServers, strictMcpConfig: false } : {})), { 
                        // 显式传递环境变量，确保 CLI 能访问 API Key
                        // 过滤 undefined，避免覆盖父进程环境变量
                        // SERVER__PORT=0 让 CLI 使用随机端口，避免与 WorkBuddy 端口冲突
                        env: getSdkEnv(), 
                        // 捕获 CLI stderr 用于排查问题
                        stderr: function (data) {
                            console.log("[CLI stderr] ".concat(data.trim()));
                        } }), (sdkSessionId ? { resume: sdkSessionId } : {}) // 使用 resume 恢复对话
                    )
                });
                fullResponse = "";
                toolCalls = [];
                newSdkSessionId = null;
                // 发送会话ID和消息ID
                res.write("data: ".concat(JSON.stringify({
                    type: "init",
                    sessionId: session.id,
                    userMessageId: userMessageId,
                    assistantMessageId: assistantMessageId,
                    model: selectedModel,
                    mcpServers: lastMcpStatus.length > 0 ? lastMcpStatus : serializeMcpConfigStatus(),
                    skills: lastAvailableSkills,
                }), "\n\n"));
                currentToolId = null;
                STREAM_TIMEOUT_MS_1 = 45000;
                streamTimeoutChecker = setInterval(function () {
                    if (!streamClosed && activePermissionRequests === 0 && Date.now() - streamLastActivity > STREAM_TIMEOUT_MS_1) {
                        console.error("[Stream] TIMEOUT: ".concat(STREAM_TIMEOUT_MS_1, "ms \u65E0\u6D3B\u52A8\uFF0C\u5F3A\u5236\u7ED3\u675F"));
                        res.write("data: ".concat(JSON.stringify({ type: "error", message: "响应超时，CLI 进程可能卡住或认证失败" }), "\n\n"));
                        closeStream('响应超时').catch(function (error) {
                            console.warn("[Chat] Timeout cleanup failed: ".concat((error === null || error === void 0 ? void 0 : error.message) || error));
                        });
                        res.end();
                    }
                }, 10000);
                _h.label = 12;
            case 12:
                _h.trys.push([12, 18, 19, 24]);
                _loop_1 = function () {
                    var msg, initMessage, event_1, delta, content, _loop_2, _i, content_1, block, errorMessage, msgAny, toolId_1, isError, content, tool, errors, errorMsg;
                    return __generator(this, function (_j) {
                        switch (_j.label) {
                            case 0:
                                _f = stream_2_1.value;
                                _c = false;
                                msg = _f;
                                if (streamClosed)
                                    return [2 /*return*/, "break"];
                                streamLastActivity = Date.now();
                                console.log("[Stream] Message type:", msg.type, JSON.stringify(msg).slice(0, 200));
                                if (!(msg.type === "system" && msg.subtype === "init")) return [3 /*break*/, 3];
                                initMessage = msg;
                                newSdkSessionId = initMessage.session_id;
                                lastMcpStatus = Array.isArray(initMessage.mcp_servers) ? initMessage.mcp_servers : lastMcpStatus;
                                lastAvailableSkills = mergeSkillsFromInit(initMessage);
                                console.log("[Stream] Got SDK session_id: ".concat(newSdkSessionId));
                                console.log("[Stream] MCP status: ".concat(lastMcpStatus.map(function (server) { return "".concat(server.name, ":").concat(server.status); }).join(', ') || 'none'));
                                console.log("[Stream] Available skills: ".concat(lastAvailableSkills.map(function (skill) { return skill.name; }).join(', ') || 'none'));
                                res.write("data: ".concat(JSON.stringify({
                                    type: "metadata",
                                    mcpServers: lastMcpStatus,
                                    skills: lastAvailableSkills,
                                }), "\n\n"));
                                if (!(newSdkSessionId && newSdkSessionId !== sdkSessionId)) return [3 /*break*/, 2];
                                return [4 /*yield*/, db.updateSession(session.id, { sdk_session_id: newSdkSessionId })];
                            case 1:
                                _j.sent();
                                console.log("[Stream] Saved SDK session_id to database");
                                _j.label = 2;
                            case 2: return [3 /*break*/, 4];
                            case 3:
                                if (msg.type === "stream_event") {
                                    event_1 = msg.event;
                                    if ((event_1 === null || event_1 === void 0 ? void 0 : event_1.type) === "content_block_delta") {
                                        delta = event_1.delta;
                                        if ((delta === null || delta === void 0 ? void 0 : delta.type) === "text_delta" && delta.text) {
                                            fullResponse += delta.text;
                                            res.write("data: ".concat(JSON.stringify({ type: "text", content: delta.text }), "\n\n"));
                                        }
                                        else if ((delta === null || delta === void 0 ? void 0 : delta.type) === "thinking_delta" && delta.thinking) {
                                            res.write("data: ".concat(JSON.stringify({ type: "thinking", content: delta.thinking }), "\n\n"));
                                        }
                                    }
                                }
                                else if (msg.type === "assistant") {
                                    content = msg.message.content;
                                    if (typeof content === "string") {
                                        if (!fullResponse) {
                                            fullResponse += content;
                                            res.write("data: ".concat(JSON.stringify({ type: "text", content: content }), "\n\n"));
                                        }
                                    }
                                    else if (Array.isArray(content)) {
                                        _loop_2 = function (block) {
                                            if (block.type === "text") {
                                                if (!fullResponse) {
                                                    fullResponse += block.text;
                                                    res.write("data: ".concat(JSON.stringify({ type: "text", content: block.text }), "\n\n"));
                                                }
                                            }
                                            else if (block.type === "tool_use") {
                                                if (toolCalls.some(function (tool) { return tool.id === block.id; })) {
                                                    return "continue";
                                                }
                                                currentToolId = block.id || uuidv4();
                                                var toolInput = block.input || {};
                                                console.log("[Stream] Tool use: id=".concat(currentToolId, ", name=").concat(block.name));
                                                console.log("[Stream] Tool input:", JSON.stringify(toolInput, null, 2));
                                                var toolCall = {
                                                    id: currentToolId,
                                                    name: block.name,
                                                    input: toolInput,
                                                    status: "running"
                                                };
                                                toolCalls.push(toolCall);
                                                res.write("data: ".concat(JSON.stringify({
                                                    type: "tool",
                                                    id: toolCall.id,
                                                    name: toolCall.name,
                                                    input: toolCall.input,
                                                    status: toolCall.status
                                                }), "\n\n"));
                                            }
                                        };
                                        for (_i = 0, content_1 = content; _i < content_1.length; _i++) {
                                            block = content_1[_i];
                                            _loop_2(block);
                                        }
                                    }
                                }
                                else if (msg.type === "error") {
                                    errorMessage = msg.error || "处理请求时发生错误";
                                    console.error("[Stream] Error message: ".concat(errorMessage));
                                    res.write("data: ".concat(JSON.stringify({ type: "error", message: errorMessage }), "\n\n"));
                                    streamClosed = true;
                                    res.end();
                                    return [2 /*return*/, "break"];
                                }
                                else if (msg.type === "tool_result") {
                                    msgAny = msg;
                                    toolId_1 = msgAny.tool_use_id || currentToolId;
                                    isError = msgAny.is_error || false;
                                    content = msgAny.content;
                                    console.log("[Stream] Tool result: tool_use_id=".concat(toolId_1, ", is_error=").concat(isError));
                                    console.log("[Stream] Tool result content type:", typeof content);
                                    console.log("[Stream] Tool result content:", typeof content === 'string' ? content.slice(0, 500) : (_g = JSON.stringify(content, null, 2)) === null || _g === void 0 ? void 0 : _g.slice(0, 500));
                                    tool = toolCalls.find(function (t) { return t.id === toolId_1; }) || toolCalls[toolCalls.length - 1];
                                    if (tool) {
                                        tool.status = isError ? "error" : "completed";
                                        tool.isError = isError;
                                        tool.result = typeof content === 'string'
                                            ? content
                                            : JSON.stringify(content);
                                        res.write("data: ".concat(JSON.stringify({
                                            type: "tool_result",
                                            toolId: tool.id,
                                            content: tool.result,
                                            isError: isError
                                        }), "\n\n"));
                                    }
                                    currentToolId = null;
                                }
                                else if (msg.type === "result") {
                                    // 完成时确保所有工具都标记为完成
                                    toolCalls.forEach(function (tool) {
                                        if (tool.status === "running") {
                                            tool.status = "completed";
                                            res.write("data: ".concat(JSON.stringify({ type: "tool_result", toolId: tool.id, content: tool.result || "已完成" }), "\n\n"));
                                        }
                                    });
                                    // 检查是否是执行错误（如模型不存在）
                                    if (msg.is_error) {
                                        errors = msg.errors || [];
                                        errorMsg = errors.length > 0 ? errors.join('\n') : '未知错误';
                                        console.error("[Stream] Execution error: ".concat(errorMsg));
                                        res.write("data: ".concat(JSON.stringify({ type: "error", message: errorMsg, subtype: msg.subtype }), "\n\n"));
                                    }
                                    else {
                                        res.write("data: ".concat(JSON.stringify({ type: "done", duration: msg.duration_ms, cost: msg.total_cost_usd }), "\n\n"));
                                    }
                                }
                                _j.label = 4;
                            case 4: return [2 /*return*/];
                        }
                    });
                };
                _c = true, stream_2 = __asyncValues(stream);
                _h.label = 13;
            case 13: return [4 /*yield*/, stream_2.next()];
            case 14:
                if (!(stream_2_1 = _h.sent(), _d = stream_2_1.done, !_d)) return [3 /*break*/, 17];
                return [5 /*yield**/, _loop_1()];
            case 15:
                state_1 = _h.sent();
                if (state_1 === "break")
                    return [3 /*break*/, 17];
                _h.label = 16;
            case 16:
                _c = true;
                return [3 /*break*/, 13];
            case 17: return [3 /*break*/, 24];
            case 18:
                e_2_1 = _h.sent();
                e_2 = { error: e_2_1 };
                return [3 /*break*/, 24];
            case 19:
                _h.trys.push([19, , 22, 23]);
                if (!(!_c && !_d && (_e = stream_2.return))) return [3 /*break*/, 21];
                return [4 /*yield*/, _e.call(stream_2)];
            case 20:
                _h.sent();
                _h.label = 21;
            case 21: return [3 /*break*/, 23];
            case 22:
                if (e_2) throw e_2.error;
                return [7 /*endfinally*/];
            case 23: return [7 /*endfinally*/];
            case 24: 
            // 保存助手消息到数据库
            return [4 /*yield*/, db.createMessage({
                    id: assistantMessageId,
                    session_id: session.id,
                    role: 'assistant',
                    content: fullResponse,
                    model: selectedModel,
                    created_at: new Date().toISOString(),
                    tool_calls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null
                })];
            case 25:
                // 保存助手消息到数据库
                _h.sent();
                return [4 /*yield*/, db.getMessagesBySession(session.id)];
            case 26:
                messages = _h.sent();
                if (!(messages.length <= 2)) return [3 /*break*/, 28];
                return [4 /*yield*/, db.updateSession(session.id, {
                        title: message.slice(0, 30) + (message.length > 30 ? '...' : ''),
                        model: selectedModel
                    })];
            case 27:
                _h.sent();
                _h.label = 28;
            case 28:
                if (streamTimeoutChecker)
                    clearInterval(streamTimeoutChecker);
                console.log("[Chat] \u8BF7\u6C42\u5B8C\u6210 \u2713");
                if (!streamClosed) {
                    streamClosed = true;
                    res.end();
                }
                return [3 /*break*/, 30];
            case 29:
                error_11 = _h.sent();
                if (streamTimeoutChecker)
                    clearInterval(streamTimeoutChecker);
                console.error("\n[Chat] ========== \u9519\u8BEF ==========");
                console.error("[Chat] Error Name:", error_11 === null || error_11 === void 0 ? void 0 : error_11.name);
                console.error("[Chat] Error Message:", error_11 === null || error_11 === void 0 ? void 0 : error_11.message);
                console.error("[Chat] Error Code:", error_11 === null || error_11 === void 0 ? void 0 : error_11.code);
                console.error("[Chat] Error Stack:", error_11 === null || error_11 === void 0 ? void 0 : error_11.stack);
                console.error("[Chat] Full Error:", JSON.stringify(error_11, null, 2));
                errorMessage = (error_11 === null || error_11 === void 0 ? void 0 : error_11.message) || "处理请求时发生错误";
                if (!streamClosed) {
                    res.write("data: ".concat(JSON.stringify({ type: "error", message: errorMessage }), "\n\n"));
                    streamClosed = true;
                    res.end();
                }
                return [3 /*break*/, 30];
            case 30: return [2 /*return*/];
        }
    });
}); });
// ============= 志愿填报报告 API（择校 / 调剂）=============
/** 轻量手写校验（避免引入 zod）。考研模型：分数 + 专业/地区/层次，无文理选科。 */
function parseVibeInput(body) {
    if (!body || typeof body !== "object")
        return { ok: false, message: "invalid payload" };
    var b = body;
    var score = b.score;
    if (typeof score !== "number" || !Number.isInteger(score) || score < 100 || score > 500) {
        return { ok: false, message: "score 必须是 100-500 之间的整数（考研初试总分）" };
    }
    var toStringArray = function (v) {
        if (v == null)
            return undefined;
        if (!Array.isArray(v))
            return undefined;
        var arr = v.filter(function (x) { return typeof x === "string" && x.trim().length > 0; });
        return arr.length ? arr : undefined;
    };
    var level = typeof b.level === "string" && b.level.trim() ? b.level.trim() : null;
    return {
        ok: true,
        data: {
            score: score,
            majorKeywords: toStringArray(b.majorKeywords),
            regionPrefs: toStringArray(b.regionPrefs),
            level: level,
        },
    };
}
// 择校报告（取数参考 recommend 模块：yanbot 开放接口 · 一志愿录取分数）
app.post("/api/tools/school-report/vibe", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var parsed, data, err_1, message;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                parsed = parseVibeInput(req.body);
                if (!parsed.ok) {
                    return [2 /*return*/, res.json({ code: 1, success: false, message: parsed.message })];
                }
                if (!isYanbotConfigured()) {
                    return [2 /*return*/, res.json({
                            code: 1,
                            success: false,
                            message: "未配置 yanbot 开放接口凭据，请在 .env 设置 OPEN_API_KEY 与 OPEN_API_SECRET 后重启服务",
                        })];
                }
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, generateVibeReport(parsed.data)];
            case 2:
                data = _a.sent();
                res.json({ code: 0, success: true, data: data });
                return [3 /*break*/, 4];
            case 3:
                err_1 = _a.sent();
                console.error("[school-report/vibe]", err_1);
                message = err_1 instanceof YanbotApiError ? err_1.message : (err_1 === null || err_1 === void 0 ? void 0 : err_1.message) || "服务暂时不可用，请稍后重试";
                res.status(500).json({ code: 1, success: false, message: message });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// 调剂报告（取数参考 recommend 模块：yanbot 开放接口 · 调剂录取分数）
app.post("/api/tools/tiaoji-report/vibe", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var parsed, data, err_2, message;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                parsed = parseVibeInput(req.body);
                if (!parsed.ok) {
                    return [2 /*return*/, res.json({ code: 1, success: false, message: parsed.message })];
                }
                if (!isYanbotConfigured()) {
                    return [2 /*return*/, res.json({
                            code: 1,
                            success: false,
                            message: "未配置 yanbot 开放接口凭据，请在 .env 设置 OPEN_API_KEY 与 OPEN_API_SECRET 后重启服务",
                        })];
                }
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, generateTiaojiReport(parsed.data)];
            case 2:
                data = _a.sent();
                res.json({ code: 0, success: true, data: data });
                return [3 /*break*/, 4];
            case 3:
                err_2 = _a.sent();
                console.error("[tiaoji-report/vibe]", err_2);
                message = err_2 instanceof YanbotApiError ? err_2.message : (err_2 === null || err_2 === void 0 ? void 0 : err_2.message) || "服务暂时不可用，请稍后重试";
                res.status(500).json({ code: 1, success: false, message: message });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
var cachedLatestYear = null;
function defaultBand(score) {
    var s = typeof score === "number" && score > 0 ? score : 330;
    return { firstMin: s - 20, firstMax: s + 10, adjustMax: s + 5 };
}
function extractJson(text) {
    if (!text)
        return null;
    // 优先解析 ```json ... ``` 或第一个 {...}
    var fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    var candidate = fenced ? fenced[1] : text;
    var start = candidate.indexOf("{");
    var end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start)
        return null;
    try {
        return JSON.parse(candidate.slice(start, end + 1));
    }
    catch (_a) {
        return null;
    }
}
var RECOMMEND_PARSE_PROMPT = "\u4F60\u662F\u8003\u7814\u5FD7\u613F\u63A8\u8350\u7684\u9700\u6C42\u89E3\u6790\u5668\u3002\u8BF7\u628A\u8001\u5E08\u7684\u81EA\u7136\u8BED\u8A00\u9700\u6C42\u89E3\u6790\u4E3A JSON\uFF0C\u4EC5\u8F93\u51FA JSON\uFF0C\u4E0D\u8981\u4EFB\u4F55\u591A\u4F59\u6587\u5B57\u3001\u89E3\u91CA\u6216 markdown\u3002\n\n\u8F93\u51FA\u5B57\u6BB5\uFF1A\n{\n  \"score\": \u6570\u5B57\u6216 null,            // \u8003\u751F\u9884\u4F30\u603B\u5206\uFF08\u8003\u7814\u521D\u8BD5\u603B\u5206\uFF0C\u901A\u5E38 250-450\uFF09\n  \"subjectName\": \u5B57\u7B26\u4E32\u6216\u7701\u7565,      // \u62A5\u8003\u4E13\u4E1A\u540D\u79F0\u5173\u952E\u8BCD\uFF08\u5982 \"\u8BA1\u7B97\u673A\" \"\u6CD5\u5F8B\"\uFF09\n  \"provinceName\": \u5B57\u7B26\u4E32\u6216\u7701\u7565,     // \u76EE\u6807\u5730\u533A/\u7701\u4EFD\uFF08\u5982 \"\u6C5F\u82CF\" \"\u5317\u4EAC\"\uFF09\n  \"level\": \"\u53CC\u4E00\u6D41\"|\"211\"|\"985\"|null, // \u9662\u6821\u5C42\u6B21\u8981\u6C42\uFF0C\u65E0\u5219 null\n  \"targetSchoolName\": \u5B57\u7B26\u4E32\u6216\u7701\u7565, // \u660E\u786E\u70B9\u540D\u7684\u76EE\u6807\u9662\u6821\n  \"year\": \u6570\u5B57\u6216 null,             // \u6307\u5B9A\u5E74\u4EFD\uFF0C\u672A\u63D0\u53CA\u4E3A null\n  \"note\": \u5B57\u7B26\u4E32\u6216\u7701\u7565             // \u5BF9\u9700\u6C42\u7684\u4E00\u53E5\u8BDD\u5F52\u7EB3\n}\n\u53EA\u8FD4\u56DE\u4E0A\u8FF0 JSON \u5BF9\u8C61\u3002";
function parseNlToQuery(message) {
    return __awaiter(this, void 0, void 0, function () {
        var model, stream, text, _a, stream_3, stream_3_1, msg, content, _i, content_2, block, r, e_3_1, parsed, score;
        var _b, e_3, _c, _d;
        var _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    model = process.env.RECOMMEND_MODEL || defaultModel;
                    stream = query({
                        prompt: message,
                        options: {
                            cwd: process.cwd(),
                            model: model,
                            maxTurns: 1,
                            permissionMode: "bypassPermissions",
                            includePartialMessages: false,
                            systemPrompt: RECOMMEND_PARSE_PROMPT,
                            env: getSdkEnv(),
                            stderr: function (data) { return console.log("[Recommend parse stderr] ".concat(data.trim())); },
                        },
                    });
                    text = "";
                    _f.label = 1;
                case 1:
                    _f.trys.push([1, , 14, 16]);
                    _f.label = 2;
                case 2:
                    _f.trys.push([2, 7, 8, 13]);
                    _a = true, stream_3 = __asyncValues(stream);
                    _f.label = 3;
                case 3: return [4 /*yield*/, stream_3.next()];
                case 4:
                    if (!(stream_3_1 = _f.sent(), _b = stream_3_1.done, !_b)) return [3 /*break*/, 6];
                    _d = stream_3_1.value;
                    _a = false;
                    msg = _d;
                    if (msg.type === "assistant") {
                        content = (_e = msg.message) === null || _e === void 0 ? void 0 : _e.content;
                        if (typeof content === "string") {
                            text += content;
                        }
                        else if (Array.isArray(content)) {
                            for (_i = 0, content_2 = content; _i < content_2.length; _i++) {
                                block = content_2[_i];
                                if (block.type === "text")
                                    text += block.text;
                            }
                        }
                    }
                    else if (msg.type === "result") {
                        r = msg.result;
                        if (typeof r === "string" && r.trim())
                            text = r;
                        return [3 /*break*/, 6];
                    }
                    _f.label = 5;
                case 5:
                    _a = true;
                    return [3 /*break*/, 3];
                case 6: return [3 /*break*/, 13];
                case 7:
                    e_3_1 = _f.sent();
                    e_3 = { error: e_3_1 };
                    return [3 /*break*/, 13];
                case 8:
                    _f.trys.push([8, , 11, 12]);
                    if (!(!_a && !_b && (_c = stream_3.return))) return [3 /*break*/, 10];
                    return [4 /*yield*/, _c.call(stream_3)];
                case 9:
                    _f.sent();
                    _f.label = 10;
                case 10: return [3 /*break*/, 12];
                case 11:
                    if (e_3) throw e_3.error;
                    return [7 /*endfinally*/];
                case 12: return [7 /*endfinally*/];
                case 13: return [3 /*break*/, 16];
                case 14: return [4 /*yield*/, stream.interrupt().catch(function () { return undefined; })];
                case 15:
                    _f.sent();
                    return [7 /*endfinally*/];
                case 16:
                    parsed = extractJson(text) || {};
                    score = typeof parsed.score === "number" ? parsed.score : Number(parsed.score) || null;
                    return [2 /*return*/, {
                            score: score,
                            subjectName: parsed.subjectName || undefined,
                            provinceName: parsed.provinceName || undefined,
                            level: parsed.level || null,
                            targetSchoolName: parsed.targetSchoolName || undefined,
                            year: typeof parsed.year === "number" ? parsed.year : null,
                            band: defaultBand(score),
                            note: parsed.note || undefined,
                        }];
            }
        });
    });
}
function resolveYear(year) {
    return __awaiter(this, void 0, void 0, function () {
        var years, e_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (year)
                        return [2 /*return*/, year];
                    if (cachedLatestYear)
                        return [2 /*return*/, cachedLatestYear];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, getYears()];
                case 2:
                    years = _a.sent();
                    if (years.length > 0) {
                        cachedLatestYear = years[0];
                        return [2 /*return*/, cachedLatestYear];
                    }
                    return [3 /*break*/, 4];
                case 3:
                    e_4 = _a.sent();
                    console.warn("[Recommend] 获取最新年份失败，忽略 year 过滤");
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/, undefined];
            }
        });
    });
}
function schoolTags(record) {
    var s = record.school;
    var level = (record.level || (s === null || s === void 0 ? void 0 : s.level) || "").toString();
    return {
        is985: Boolean(s === null || s === void 0 ? void 0 : s.is985) || /985/.test(level),
        is211: Boolean(s === null || s === void 0 ? void 0 : s.is211) || /211/.test(level),
        isDualClass: Boolean(s === null || s === void 0 ? void 0 : s.isDual_class) || /双一流/.test(level),
    };
}
function tierForDiff(diff) {
    if (diff < 0)
        return "冲";
    if (diff <= 10)
        return "稳";
    return "保";
}
function toFirstChoiceCard(r, score) {
    var _a;
    var tags = schoolTags(r);
    var diff = typeof score === "number" && typeof r.lowestScore === "number" ? score - r.lowestScore : undefined;
    return __assign({ schoolName: r.schoolName, schoolCode: r.schoolCode, level: r.level || ((_a = r.school) === null || _a === void 0 ? void 0 : _a.level), provinceName: r.provinceName, subjectName: r.subjectName, subjectCode: r.subjectCode, college: r.college, year: r.year, lowestScore: r.lowestScore, averageScore: r.averageScore, highestScore: r.highestScore, admissions: r.firstChoiceAdmissions, applicants: r.applicants, remarks: r.remarks, scoreDiff: diff, tier: typeof diff === "number" ? tierForDiff(diff) : undefined }, tags);
}
function toAdjustedCard(r, score) {
    var _a;
    var tags = schoolTags(r);
    var diff = typeof score === "number" && typeof r.adjustedLowestScore === "number"
        ? score - r.adjustedLowestScore
        : undefined;
    return __assign({ schoolName: r.schoolName, schoolCode: r.schoolCode, level: r.level || ((_a = r.school) === null || _a === void 0 ? void 0 : _a.level), provinceName: r.provinceName, subjectName: r.subjectName, subjectCode: r.subjectCode, college: r.college, year: r.year, lowestScore: r.adjustedLowestScore, averageScore: r.adjustedAverageScore, highestScore: r.adjustedHighestScore, admissions: r.adjustedAdmissions, applicants: r.applicants, remarks: r.adjustedRemarks, scoreDiff: diff }, tags);
}
function runRecommendation(pq) {
    return __awaiter(this, void 0, void 0, function () {
        var year, common, _a, firstData, adjustData, firstItems, adjustItems;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, resolveYear(pq.year)];
                case 1:
                    year = _c.sent();
                    common = {
                        subjectName: pq.subjectName,
                        provinceName: pq.provinceName,
                        level: pq.level || undefined,
                        schoolName: pq.targetSchoolName,
                        year: year,
                        includeSchool: true,
                    };
                    return [4 /*yield*/, Promise.all([
                            querySchoolScore(__assign(__assign({}, common), { hasFirstChoice: true, minLowestScore: pq.band.firstMin, maxLowestScore: pq.band.firstMax, sortBy: "lowestScore", sortOrder: "desc", pageSize: 12 })),
                            querySchoolScore(__assign(__assign({}, common), { hasAdjustment: true, maxAdjustedLowestScore: pq.band.adjustMax, sortBy: "adjustedLowestScore", sortOrder: "desc", pageSize: 8 })),
                        ])];
                case 2:
                    _a = _c.sent(), firstData = _a[0], adjustData = _a[1];
                    firstItems = (firstData.list || []).map(function (r) { return toFirstChoiceCard(r, pq.score); });
                    adjustItems = (adjustData.list || []).map(function (r) { return toAdjustedCard(r, pq.score); });
                    return [2 /*return*/, {
                            parsedQuery: __assign(__assign({}, pq), { year: (_b = year !== null && year !== void 0 ? year : pq.year) !== null && _b !== void 0 ? _b : null }),
                            groups: [
                                { category: "一志愿", items: firstItems },
                                { category: "调剂", items: adjustItems },
                            ],
                            note: pq.note,
                        }];
            }
        });
    });
}
// 推荐：自然语言解析 + 两路检索 + 归一化（或按快捷筛选增量重查）
app.post("/api/recommend", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, message, prevQuery, filterDelta, pq, band, result, error_13;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                if (!isYanbotConfigured()) {
                    return [2 /*return*/, res.status(500).json({
                            error: "未配置 yanbot 开放接口凭据，请在 .env 设置 OPEN_API_KEY 与 OPEN_API_SECRET 后重启服务",
                        })];
                }
                _a = req.body, message = _a.message, prevQuery = _a.prevQuery, filterDelta = _a.filterDelta;
                _b.label = 1;
            case 1:
                _b.trys.push([1, 6, , 7]);
                pq = void 0;
                if (!(prevQuery && filterDelta)) return [3 /*break*/, 2];
                band = {
                    firstMin: prevQuery.band.firstMin + (filterDelta.firstMinDelta || 0),
                    firstMax: prevQuery.band.firstMax + (filterDelta.firstMaxDelta || 0),
                    adjustMax: prevQuery.band.adjustMax + (filterDelta.adjustMaxDelta || 0),
                };
                pq = __assign(__assign({}, prevQuery), { band: band, level: filterDelta.level !== undefined ? filterDelta.level : prevQuery.level });
                return [3 /*break*/, 4];
            case 2:
                if (!message || !message.trim()) {
                    return [2 /*return*/, res.status(400).json({ error: "请输入考生信息与需求" })];
                }
                console.log("[Recommend] \u89E3\u6790\u9700\u6C42: ".concat(message.slice(0, 80)));
                return [4 /*yield*/, parseNlToQuery(message)];
            case 3:
                pq = _b.sent();
                _b.label = 4;
            case 4: return [4 /*yield*/, runRecommendation(pq)];
            case 5:
                result = _b.sent();
                res.json(result);
                return [3 /*break*/, 7];
            case 6:
                error_13 = _b.sent();
                if (error_13 instanceof YanbotApiError) {
                    console.error("[Recommend] yanbot 接口错误:", error_13.message);
                    return [2 /*return*/, res.status(error_13.statusCode >= 400 ? error_13.statusCode : 502).json({ error: error_13.message })];
                }
                console.error("[Recommend] 失败:", error_13);
                res.status(500).json({ error: (error_13 === null || error_13 === void 0 ? void 0 : error_13.message) || "推荐失败" });
                return [3 /*break*/, 7];
            case 7: return [2 /*return*/];
        }
    });
}); });
// ============= 案例收藏 API =============
app.get("/api/cases", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var rows, cases, error_14;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, db.getAllFavoriteCases()];
            case 1:
                rows = _a.sent();
                cases = rows.map(function (r) { return ({
                    id: r.id,
                    title: r.title,
                    candidateSummary: r.candidate_summary,
                    note: r.note,
                    createdAt: r.created_at,
                }); });
                res.json({ cases: cases });
                return [3 /*break*/, 3];
            case 2:
                error_14 = _a.sent();
                res.status(500).json({ error: (error_14 === null || error_14 === void 0 ? void 0 : error_14.message) || "获取案例失败" });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
app.get("/api/cases/:id", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var row, error_15;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, db.getFavoriteCase(req.params.id)];
            case 1:
                row = _a.sent();
                if (!row)
                    return [2 /*return*/, res.status(404).json({ error: "案例不存在" })];
                res.json({
                    id: row.id,
                    title: row.title,
                    candidateSummary: row.candidate_summary,
                    note: row.note,
                    createdAt: row.created_at,
                    query: JSON.parse(row.query_json),
                    result: JSON.parse(row.result_json),
                });
                return [3 /*break*/, 3];
            case 2:
                error_15 = _a.sent();
                res.status(500).json({ error: (error_15 === null || error_15 === void 0 ? void 0 : error_15.message) || "获取案例失败" });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
app.post("/api/cases", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, title, candidateSummary, q, result, note, now, item, error_16;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                _a = req.body || {}, title = _a.title, candidateSummary = _a.candidateSummary, q = _a.query, result = _a.result, note = _a.note;
                if (!q || !result) {
                    return [2 /*return*/, res.status(400).json({ error: "缺少 query 或 result" })];
                }
                now = new Date().toISOString();
                item = {
                    id: uuidv4(),
                    title: (title && String(title).slice(0, 100)) || "未命名案例",
                    candidate_summary: candidateSummary ? String(candidateSummary).slice(0, 200) : null,
                    query_json: JSON.stringify(q),
                    result_json: JSON.stringify(result),
                    note: note ? String(note) : null,
                    created_at: now,
                };
                return [4 /*yield*/, db.createFavoriteCase(item)];
            case 1:
                _b.sent();
                res.json({ id: item.id, success: true });
                return [3 /*break*/, 3];
            case 2:
                error_16 = _b.sent();
                res.status(500).json({ error: (error_16 === null || error_16 === void 0 ? void 0 : error_16.message) || "收藏失败" });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
app.delete("/api/cases/:id", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var error_17;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, db.deleteFavoriteCase(req.params.id)];
            case 1:
                _a.sent();
                res.json({ success: true });
                return [3 /*break*/, 3];
            case 2:
                error_17 = _a.sent();
                res.status(500).json({ error: (error_17 === null || error_17 === void 0 ? void 0 : error_17.message) || "删除失败" });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// 启动服务器
app.listen(PORT, function () {
    console.log("\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557\n\u2551                                            \u2551\n\u2551     \u25C9 API \u670D\u52A1\u5668\u5DF2\u542F\u52A8                      \u2551\n\u2551                                            \u2551\n\u2551     \u5730\u5740: http://localhost:".concat(PORT, "            \u2551\n\u2551     \u6570\u636E\u5E93: SQLite (data/chat.db)          \u2551\n\u2551                                            \u2551\n\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D\n  "));
});
