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
import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
/**
 * 志愿填报数据库（只读）。
 *
 * 数据来源：yanbot-claw 导入脚本生成的 data/yanbot.db（表 schools / admissions）。
 * 与聊天库（server/db.ts 的 chat.db）完全独立，互不影响。
 */
var dbPath = path.join(__dirname, '..', 'data', 'yanbot.db');
var db = null;
var SQL;
var initPromise = null;
function initDatabase() {
    return __awaiter(this, void 0, void 0, function () {
        var fileBuffer;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, initSqlJs({
                        locateFile: function (file) { return path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file); },
                    })];
                case 1:
                    SQL = _a.sent();
                    if (!fs.existsSync(dbPath)) {
                        throw new Error("[yanbot-db] \u672A\u627E\u5230\u6570\u636E\u5E93\u6587\u4EF6: ".concat(dbPath, "\u3002\u8BF7\u5148\u7528 yanbot-claw \u7684\u5BFC\u5165\u811A\u672C\u751F\u6210 yanbot.db \u5E76\u590D\u5236\u5230 data/ \u76EE\u5F55\u3002"));
                    }
                    fileBuffer = fs.readFileSync(dbPath);
                    db = new SQL.Database(fileBuffer);
                    console.log('[yanbot-db] Loaded admissions database from', dbPath);
                    return [2 /*return*/];
            }
        });
    });
}
/** 确保数据库已加载（幂等）。路由处理前调用。 */
export function ensureYanbotDb() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!initPromise) {
                        initPromise = initDatabase().catch(function (err) {
                            // 允许下次重试
                            initPromise = null;
                            throw err;
                        });
                    }
                    return [4 /*yield*/, initPromise];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 执行参数化查询，返回行对象数组。
 * 用于替代 better-sqlite3 的 `db.prepare(sql).all(...params)`。
 */
export function queryAll(sql, params) {
    if (params === void 0) { params = []; }
    if (!db) {
        throw new Error('[yanbot-db] 数据库尚未初始化，请先 await ensureYanbotDb()');
    }
    var stmt = db.prepare(sql);
    try {
        stmt.bind(params);
        var rows = [];
        while (stmt.step()) {
            rows.push(stmt.getAsObject());
        }
        return rows;
    }
    finally {
        stmt.free();
    }
}
