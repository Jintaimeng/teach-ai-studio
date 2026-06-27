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
// 数据库文件路径
var dbPath = path.join(__dirname, '..', 'data', 'chat.db');
var dataDir = path.dirname(dbPath);
var db;
var SQL;
var dbReady = false;
// 初始化的 Promise
var initPromise = null;
// ============= 数据库初始化 =============
function initDatabase() {
    return __awaiter(this, void 0, void 0, function () {
        var fileBuffer, tableInfo, hasColumn;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (dbReady)
                        return [2 /*return*/];
                    // 确保 data 目录存在
                    if (!fs.existsSync(dataDir)) {
                        fs.mkdirSync(dataDir, { recursive: true });
                    }
                    return [4 /*yield*/, initSqlJs({
                            locateFile: function (file) { return path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file); }
                        })];
                case 1:
                    SQL = _a.sent();
                    // 尝试从文件加载已有数据库
                    if (fs.existsSync(dbPath)) {
                        fileBuffer = fs.readFileSync(dbPath);
                        db = new SQL.Database(fileBuffer);
                        console.log('[DB] Loaded existing database from', dbPath);
                    }
                    else {
                        db = new SQL.Database();
                        console.log('[DB] Created new in-memory database');
                    }
                    // 初始化表结构
                    db.run("\n    CREATE TABLE IF NOT EXISTS sessions (\n      id TEXT PRIMARY KEY,\n      title TEXT NOT NULL,\n      model TEXT NOT NULL,\n      sdk_session_id TEXT,\n      created_at TEXT NOT NULL,\n      updated_at TEXT NOT NULL\n    )\n  ");
                    db.run("\n    CREATE TABLE IF NOT EXISTS messages (\n      id TEXT PRIMARY KEY,\n      session_id TEXT NOT NULL,\n      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),\n      content TEXT NOT NULL,\n      model TEXT,\n      created_at TEXT NOT NULL,\n      tool_calls TEXT,\n      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE\n    )\n  ");
                    db.run('CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)');
                    // 数据库迁移：添加 sdk_session_id 列（如果不存在）
                    try {
                        tableInfo = execAsObjects('PRAGMA table_info(sessions)');
                        hasColumn = tableInfo.some(function (col) { return col.name === 'sdk_session_id'; });
                        if (!hasColumn) {
                            db.run('ALTER TABLE sessions ADD COLUMN sdk_session_id TEXT');
                            console.log('[DB] Added sdk_session_id column to sessions table');
                        }
                    }
                    catch (e) {
                        // 忽略错误（列可能已存在）
                        console.log('[DB] Migration check:', e);
                    }
                    dbReady = true;
                    persistToDisk();
                    return [2 /*return*/];
            }
        });
    });
}
// 持久化到磁盘
function persistToDisk() {
    if (!dbReady)
        return;
    try {
        var data = db.export();
        var buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    }
    catch (e) {
        console.error('[DB] Failed to persist:', e);
    }
}
// 确保数据库就绪
function ensureDb() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!initPromise) {
                        initPromise = initDatabase();
                    }
                    return [4 /*yield*/, initPromise];
                case 1:
                    _a.sent();
                    return [2 /*return*/, db];
            }
        });
    });
}
// 在修改操作后自动持久化
function afterWrite() {
    persistToDisk();
}
// ============= 查询辅助函数 =============
// 执行 SELECT 并返回对象数组
function execAsObjects(sql, params) {
    var stmt = db.prepare(sql);
    if (params) {
        stmt.bind(params);
    }
    var results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}
// 执行非查询 SQL（INSERT/UPDATE/DELETE）
function runSql(sql, params) {
    if (params) {
        db.run(sql, params);
    }
    else {
        db.run(sql);
    }
}
// ============= 会话操作 =============
export function getAllSessions() {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureDb()];
                case 1:
                    _a.sent();
                    rows = execAsObjects('SELECT * FROM sessions ORDER BY updated_at DESC');
                    return [2 /*return*/, rows];
            }
        });
    });
}
export function getSession(id) {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureDb()];
                case 1:
                    _a.sent();
                    rows = execAsObjects('SELECT * FROM sessions WHERE id = ?', [id]);
                    return [2 /*return*/, rows[0]];
            }
        });
    });
}
export function createSession(session) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureDb()];
                case 1:
                    _a.sent();
                    runSql('INSERT INTO sessions (id, title, model, sdk_session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [session.id, session.title, session.model, session.sdk_session_id, session.created_at, session.updated_at]);
                    afterWrite();
                    return [2 /*return*/, session];
            }
        });
    });
}
export function updateSession(id, updates) {
    return __awaiter(this, void 0, void 0, function () {
        var fields, values;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureDb()];
                case 1:
                    _a.sent();
                    fields = [];
                    values = [];
                    if (updates.title !== undefined) {
                        fields.push('title = ?');
                        values.push(updates.title);
                    }
                    if (updates.model !== undefined) {
                        fields.push('model = ?');
                        values.push(updates.model);
                    }
                    if (updates.sdk_session_id !== undefined) {
                        fields.push('sdk_session_id = ?');
                        values.push(updates.sdk_session_id);
                    }
                    if (fields.length === 0)
                        return [2 /*return*/, false];
                    fields.push('updated_at = ?');
                    values.push(new Date().toISOString());
                    values.push(id);
                    runSql("UPDATE sessions SET ".concat(fields.join(', '), " WHERE id = ?"), values);
                    afterWrite();
                    return [2 /*return*/, true];
            }
        });
    });
}
export function deleteSession(id) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureDb()];
                case 1:
                    _a.sent();
                    // 先删除关联的消息
                    runSql('DELETE FROM messages WHERE session_id = ?', [id]);
                    runSql('DELETE FROM sessions WHERE id = ?', [id]);
                    afterWrite();
                    return [2 /*return*/, true];
            }
        });
    });
}
// ============= 消息操作 =============
export function getMessagesBySession(sessionId) {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureDb()];
                case 1:
                    _a.sent();
                    rows = execAsObjects('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC', [sessionId]);
                    return [2 /*return*/, rows];
            }
        });
    });
}
export function createMessage(message) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureDb()];
                case 1:
                    _a.sent();
                    runSql('INSERT INTO messages (id, session_id, role, content, model, created_at, tool_calls) VALUES (?, ?, ?, ?, ?, ?, ?)', [message.id, message.session_id, message.role, message.content, message.model, message.created_at, message.tool_calls]);
                    // 更新会话的 updated_at
                    runSql('UPDATE sessions SET updated_at = ? WHERE id = ?', [new Date().toISOString(), message.session_id]);
                    afterWrite();
                    return [2 /*return*/, message];
            }
        });
    });
}
export function updateMessage(id, updates) {
    return __awaiter(this, void 0, void 0, function () {
        var fields, values;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureDb()];
                case 1:
                    _a.sent();
                    fields = [];
                    values = [];
                    if (updates.content !== undefined) {
                        fields.push('content = ?');
                        values.push(updates.content);
                    }
                    if (updates.tool_calls !== undefined) {
                        fields.push('tool_calls = ?');
                        values.push(updates.tool_calls);
                    }
                    if (fields.length === 0)
                        return [2 /*return*/, false];
                    values.push(id);
                    runSql("UPDATE messages SET ".concat(fields.join(', '), " WHERE id = ?"), values);
                    afterWrite();
                    return [2 /*return*/, true];
            }
        });
    });
}
export function deleteMessage(id) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureDb()];
                case 1:
                    _a.sent();
                    runSql('DELETE FROM messages WHERE id = ?', [id]);
                    afterWrite();
                    return [2 /*return*/, true];
            }
        });
    });
}
export function createMessages(messages) {
    return __awaiter(this, void 0, void 0, function () {
        var _i, messages_1, msg;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureDb()];
                case 1:
                    _a.sent();
                    for (_i = 0, messages_1 = messages; _i < messages_1.length; _i++) {
                        msg = messages_1[_i];
                        runSql('INSERT INTO messages (id, session_id, role, content, model, created_at, tool_calls) VALUES (?, ?, ?, ?, ?, ?, ?)', [msg.id, msg.session_id, msg.role, msg.content, msg.model, msg.created_at, msg.tool_calls]);
                    }
                    afterWrite();
                    return [2 /*return*/];
            }
        });
    });
}
export function clearAllData() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ensureDb()];
                case 1:
                    _a.sent();
                    runSql('DELETE FROM messages');
                    runSql('DELETE FROM sessions');
                    afterWrite();
                    return [2 /*return*/];
            }
        });
    });
}
export default { getAllSessions: getAllSessions, getSession: getSession, createSession: createSession, updateSession: updateSession, deleteSession: deleteSession, getMessagesBySession: getMessagesBySession, createMessage: createMessage, updateMessage: updateMessage, deleteMessage: deleteMessage, createMessages: createMessages, clearAllData: clearAllData };
