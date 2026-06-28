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
var MCP_HOST = process.env.YANBOT_MCP_HOST || "api.yanbot.tech";
var MCP_PATH = process.env.YANBOT_MCP_PATH || "/mcp";
var MAX_RETRY = 5;
var REQUEST_TIMEOUT_MS = 20000;
var mcpReady = false;
var sessionId = null;
var connectPromise = null;
function mcpPost(body, sid) {
    return new Promise(function (resolve, reject) {
        var data = JSON.stringify(body);
        var headers = {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            "Content-Length": String(Buffer.byteLength(data)),
        };
        if (sid)
            headers["mcp-session-id"] = sid;
        var req = https.request({ hostname: MCP_HOST, path: MCP_PATH, method: "POST", headers: headers, timeout: REQUEST_TIMEOUT_MS }, function (res) {
            var newSid = res.headers["mcp-session-id"] || undefined;
            var buf = "";
            res.setEncoding("utf8");
            res.on("data", function (c) {
                buf += c;
            });
            res.on("end", function () {
                var rpc = null;
                // 响应可能是纯 JSON，也可能是 SSE（data: {...}）
                var trimmed = buf.trim();
                if (trimmed.startsWith("{")) {
                    try {
                        rpc = JSON.parse(trimmed);
                    }
                    catch (_a) {
                        /* ignore */
                    }
                }
                if (!rpc) {
                    for (var _i = 0, _b = buf.split("\n"); _i < _b.length; _i++) {
                        var line = _b[_i];
                        if (line.startsWith("data: ")) {
                            try {
                                rpc = JSON.parse(line.slice(6));
                            }
                            catch (_c) {
                                /* ignore */
                            }
                        }
                    }
                }
                resolve({ rpc: rpc, sessionId: newSid || sid || null });
            });
            res.on("error", reject);
        });
        req.on("timeout", function () { return req.destroy(new Error("yanbot MCP 请求超时")); });
        req.on("error", reject);
        req.write(data);
        req.end();
    });
}
function connectMcp() {
    return __awaiter(this, void 0, void 0, function () {
        var lastErr, attempt, _a, rpc, sid, err_1;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    lastErr = null;
                    attempt = 1;
                    _c.label = 1;
                case 1:
                    if (!(attempt <= MAX_RETRY)) return [3 /*break*/, 7];
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 5, , 6]);
                    return [4 /*yield*/, mcpPost({
                            jsonrpc: "2.0",
                            id: 1,
                            method: "initialize",
                            params: {
                                protocolVersion: "2024-11-05",
                                capabilities: {},
                                clientInfo: { name: "teach-ai-studio-promo", version: "1.0" },
                            },
                        })];
                case 3:
                    _a = _c.sent(), rpc = _a.rpc, sid = _a.sessionId;
                    if (!sid || (rpc === null || rpc === void 0 ? void 0 : rpc.error)) {
                        throw new Error(((_b = rpc === null || rpc === void 0 ? void 0 : rpc.error) === null || _b === void 0 ? void 0 : _b.message) || "yanbot MCP 未返回会话 ID");
                    }
                    sessionId = sid;
                    // 发送 initialized 通知（无响应）
                    return [4 /*yield*/, mcpPost({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }, sessionId)];
                case 4:
                    // 发送 initialized 通知（无响应）
                    _c.sent();
                    mcpReady = true;
                    console.log("[yanbotMcp] MCP 会话就绪:", sessionId);
                    return [2 /*return*/];
                case 5:
                    err_1 = _c.sent();
                    lastErr = err_1;
                    console.error("[yanbotMcp] \u8FDE\u63A5\u5931\u8D25 (\u7B2C ".concat(attempt, "/").concat(MAX_RETRY, " \u6B21):"), (err_1 === null || err_1 === void 0 ? void 0 : err_1.message) || err_1);
                    return [3 /*break*/, 6];
                case 6:
                    attempt++;
                    return [3 /*break*/, 1];
                case 7:
                    mcpReady = false;
                    sessionId = null;
                    throw new Error("\u65E0\u6CD5\u8FDE\u63A5 yanbot MCP \u670D\u52A1\uFF1A".concat((lastErr === null || lastErr === void 0 ? void 0 : lastErr.message) || lastErr));
            }
        });
    });
}
/** 懒初始化会话（并发去重） */
export function ensureMcpReady() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (mcpReady && sessionId)
                        return [2 /*return*/];
                    if (!connectPromise) {
                        connectPromise = connectMcp().finally(function () {
                            connectPromise = null;
                        });
                    }
                    return [4 /*yield*/, connectPromise];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/** 调用 MCP 工具，解析 result.content[0].text 为 JSON */
export function callTool(tool, args) {
    return __awaiter(this, void 0, void 0, function () {
        var rpcId, rpc, text, err_2;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, ensureMcpReady()];
                case 1:
                    _e.sent();
                    rpcId = Math.floor((Date.now() % 1e9) + Math.floor(performance.now())) % 1e9;
                    _e.label = 2;
                case 2:
                    _e.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, mcpPost({ jsonrpc: "2.0", id: rpcId, method: "tools/call", params: { name: tool, arguments: args || {} } }, sessionId)];
                case 3:
                    rpc = (_e.sent()).rpc;
                    if (!rpc)
                        throw new Error("yanbot MCP 返回为空");
                    if (rpc.error)
                        throw new Error(rpc.error.message || JSON.stringify(rpc.error));
                    text = (_c = (_b = (_a = rpc.result) === null || _a === void 0 ? void 0 : _a.content) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.text;
                    if (typeof text !== "string")
                        return [2 /*return*/, ((_d = rpc.result) !== null && _d !== void 0 ? _d : null)];
                    try {
                        return [2 /*return*/, JSON.parse(text)];
                    }
                    catch (_f) {
                        return [2 /*return*/, { raw: text }];
                    }
                    return [3 /*break*/, 5];
                case 4:
                    err_2 = _e.sent();
                    // 会话可能过期，重置以便下次重连
                    mcpReady = false;
                    sessionId = null;
                    throw err_2;
                case 5: return [2 /*return*/];
            }
        });
    });
}
var DEFAULT_FEED_FIELDS = ["_id", "title", "link", "isoDate", "tags", "feedMeta"];
/** 查询资讯列表 */
export function queryFeeds(params) {
    var _a, _b, _c;
    if (params === void 0) { params = {}; }
    var args = {
        page: (_a = params.page) !== null && _a !== void 0 ? _a : 1,
        pageSize: (_b = params.pageSize) !== null && _b !== void 0 ? _b : 20,
        fields: (_c = params.fields) !== null && _c !== void 0 ? _c : DEFAULT_FEED_FIELDS,
    };
    if (params.keyword)
        args.keyword = params.keyword;
    if (params.taskIds && params.taskIds.length)
        args.taskIds = params.taskIds;
    return callTool("query_feeds", args);
}
/** 资讯聚合统计 */
export function aggregateFeeds(params) {
    if (params === void 0) { params = {}; }
    return callTool("aggregate_feeds", params);
}
/** 查询院校专业历年录取分数线 */
export function querySchoolScores(params) {
    var _a, _b, _c, _d;
    if (params === void 0) { params = {}; }
    var args = {
        page: (_a = params.page) !== null && _a !== void 0 ? _a : 1,
        pageSize: (_b = params.pageSize) !== null && _b !== void 0 ? _b : 20,
        sortBy: (_c = params.sortBy) !== null && _c !== void 0 ? _c : "lowestScore",
        sortOrder: (_d = params.sortOrder) !== null && _d !== void 0 ? _d : "desc",
    };
    if (params.schoolName)
        args.schoolName = params.schoolName;
    if (params.subjectName)
        args.subjectName = params.subjectName;
    if (params.subjectCode)
        args.subjectCode = params.subjectCode;
    if (typeof params.year === "number")
        args.year = params.year;
    if (params.level)
        args.level = params.level;
    if (params.studyForm)
        args.studyForm = params.studyForm;
    if (typeof params.minLowestScore === "number")
        args.minLowestScore = params.minLowestScore;
    return callTool("query_school_scores", args);
}
/** 可用年份（降序） */
export function listScoreYears() {
    return __awaiter(this, void 0, void 0, function () {
        var r;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, callTool("list_score_years", {})];
                case 1:
                    r = _a.sent();
                    return [2 /*return*/, (r === null || r === void 0 ? void 0 : r.years) || []];
            }
        });
    });
}
/** 院校层次枚举 */
export function listScoreLevels() {
    return __awaiter(this, void 0, void 0, function () {
        var r;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, callTool("list_score_levels", {})];
                case 1:
                    r = _a.sent();
                    return [2 /*return*/, (r === null || r === void 0 ? void 0 : r.levels) || []];
            }
        });
    });
}
/**
 * 按 id 取资讯完整内容（用于喂模型）。
 * 优先拉取一批带正文字段的资讯，再按 _id 过滤；保持入参顺序。
 */
export function getFeedsByIds(ids) {
    return __awaiter(this, void 0, void 0, function () {
        var wanted, collected, fields, MAX_PAGES, pageSize, page, res, err_3, list, _i, list_1, item, totalPages;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    wanted = new Set(ids);
                    if (wanted.size === 0)
                        return [2 /*return*/, []];
                    collected = new Map();
                    fields = ["_id", "title", "link", "isoDate", "tags", "feedMeta", "content", "contentSnippet", "summary"];
                    MAX_PAGES = 10;
                    pageSize = 50;
                    page = 1;
                    _b.label = 1;
                case 1:
                    if (!(page <= MAX_PAGES && collected.size < wanted.size)) return [3 /*break*/, 7];
                    res = void 0;
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, queryFeeds({ page: page, pageSize: pageSize, fields: fields })];
                case 3:
                    res = _b.sent();
                    return [3 /*break*/, 5];
                case 4:
                    err_3 = _b.sent();
                    console.error("[yanbotMcp] getFeedsByIds 查询失败:", (err_3 === null || err_3 === void 0 ? void 0 : err_3.message) || err_3);
                    return [3 /*break*/, 7];
                case 5:
                    list = (res === null || res === void 0 ? void 0 : res.list) || [];
                    for (_i = 0, list_1 = list; _i < list_1.length; _i++) {
                        item = list_1[_i];
                        if ((item === null || item === void 0 ? void 0 : item._id) && wanted.has(item._id))
                            collected.set(item._id, item);
                    }
                    totalPages = (_a = res === null || res === void 0 ? void 0 : res.pagination) === null || _a === void 0 ? void 0 : _a.totalPages;
                    if (!list.length || (typeof totalPages === "number" && page >= totalPages))
                        return [3 /*break*/, 7];
                    _b.label = 6;
                case 6:
                    page++;
                    return [3 /*break*/, 1];
                case 7: return [2 /*return*/, ids.map(function (id) { return collected.get(id); }).filter(Boolean)];
            }
        });
    });
}
