import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库文件路径
const dbPath = path.join(__dirname, '..', 'data', 'chat.db');
const dataDir = path.dirname(dbPath);

let db: SqlJsDatabase;
let SQL: SqlJsStatic;
let dbReady = false;

// 初始化的 Promise
let initPromise: Promise<void> | null = null;

// 类型定义
export interface DbSession {
  id: string;
  title: string;
  model: string;
  sdk_session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  model: string | null;
  created_at: string;
  tool_calls: string | null;
}

// ============= 数据库初始化 =============

async function initDatabase(): Promise<void> {
  if (dbReady) return;

  // 确保 data 目录存在
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  SQL = await initSqlJs({
    locateFile: (file: string) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file)
  });

  // 尝试从文件加载已有数据库
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
    console.log('[DB] Loaded existing database from', dbPath);
  } else {
    db = new SQL.Database();
    console.log('[DB] Created new in-memory database');
  }

  // 初始化表结构
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      model TEXT NOT NULL,
      sdk_session_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      model TEXT,
      created_at TEXT NOT NULL,
      tool_calls TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)');

  // 数据库迁移：添加 sdk_session_id 列（如果不存在）
  try {
    const tableInfo = execAsObjects('PRAGMA table_info(sessions)') as Array<{ name: string }>;
    const hasColumn = tableInfo.some(col => col.name === 'sdk_session_id');
    if (!hasColumn) {
      db.run('ALTER TABLE sessions ADD COLUMN sdk_session_id TEXT');
      console.log('[DB] Added sdk_session_id column to sessions table');
    }
  } catch (e) {
    // 忽略错误（列可能已存在）
    console.log('[DB] Migration check:', e);
  }

  dbReady = true;
  persistToDisk();
}

// 持久化到磁盘
function persistToDisk(): void {
  if (!dbReady) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (e) {
    console.error('[DB] Failed to persist:', e);
  }
}

// 确保数据库就绪
async function ensureDb(): Promise<SqlJsDatabase> {
  if (!initPromise) {
    initPromise = initDatabase();
  }
  await initPromise;
  return db;
}

// 在修改操作后自动持久化
function afterWrite(): void {
  persistToDisk();
}

// ============= 查询辅助函数 =============

// 执行 SELECT 并返回对象数组
function execAsObjects(sql: string, params?: any[]): any[] {
  const stmt = db.prepare(sql);
  if (params) {
    stmt.bind(params);
  }
  const results: any[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// 执行非查询 SQL（INSERT/UPDATE/DELETE）
function runSql(sql: string, params?: any[]): void {
  if (params) {
    db.run(sql, params);
  } else {
    db.run(sql);
  }
}

// ============= 会话操作 =============

export async function getAllSessions(): Promise<DbSession[]> {
  await ensureDb();
  const rows = execAsObjects('SELECT * FROM sessions ORDER BY updated_at DESC');
  return rows as DbSession[];
}

export async function getSession(id: string): Promise<DbSession | undefined> {
  await ensureDb();
  const rows = execAsObjects('SELECT * FROM sessions WHERE id = ?', [id]);
  return rows[0] as DbSession | undefined;
}

export async function createSession(session: DbSession): Promise<DbSession> {
  await ensureDb();
  runSql(
    'INSERT INTO sessions (id, title, model, sdk_session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [session.id, session.title, session.model, session.sdk_session_id, session.created_at, session.updated_at]
  );
  afterWrite();
  return session;
}

export async function updateSession(
  id: string,
  updates: Partial<Pick<DbSession, 'title' | 'model' | 'sdk_session_id'>>
): Promise<boolean> {
  await ensureDb();
  const fields: string[] = [];
  const values: any[] = [];

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

  if (fields.length === 0) return false;

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  runSql(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`, values);
  afterWrite();
  return true;
}

export async function deleteSession(id: string): Promise<boolean> {
  await ensureDb();
  // 先删除关联的消息
  runSql('DELETE FROM messages WHERE session_id = ?', [id]);
  runSql('DELETE FROM sessions WHERE id = ?', [id]);
  afterWrite();
  return true;
}

// ============= 消息操作 =============

export async function getMessagesBySession(sessionId: string): Promise<DbMessage[]> {
  await ensureDb();
  const rows = execAsObjects('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC', [sessionId]);
  return rows as DbMessage[];
}

export async function createMessage(message: DbMessage): Promise<DbMessage> {
  await ensureDb();
  runSql(
    'INSERT INTO messages (id, session_id, role, content, model, created_at, tool_calls) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [message.id, message.session_id, message.role, message.content, message.model, message.created_at, message.tool_calls]
  );
  // 更新会话的 updated_at
  runSql('UPDATE sessions SET updated_at = ? WHERE id = ?', [new Date().toISOString(), message.session_id]);
  afterWrite();
  return message;
}

export async function updateMessage(
  id: string,
  updates: Partial<Pick<DbMessage, 'content' | 'tool_calls'>>
): Promise<boolean> {
  await ensureDb();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.content !== undefined) {
    fields.push('content = ?');
    values.push(updates.content);
  }
  if (updates.tool_calls !== undefined) {
    fields.push('tool_calls = ?');
    values.push(updates.tool_calls);
  }

  if (fields.length === 0) return false;

  values.push(id);
  runSql(`UPDATE messages SET ${fields.join(', ')} WHERE id = ?`, values);
  afterWrite();
  return true;
}

export async function deleteMessage(id: string): Promise<boolean> {
  await ensureDb();
  runSql('DELETE FROM messages WHERE id = ?', [id]);
  afterWrite();
  return true;
}

export async function createMessages(messages: DbMessage[]): Promise<void> {
  await ensureDb();
  for (const msg of messages) {
    runSql(
      'INSERT INTO messages (id, session_id, role, content, model, created_at, tool_calls) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [msg.id, msg.session_id, msg.role, msg.content, msg.model, msg.created_at, msg.tool_calls]
    );
  }
  afterWrite();
}

export async function clearAllData(): Promise<void> {
  await ensureDb();
  runSql('DELETE FROM messages');
  runSql('DELETE FROM sessions');
  afterWrite();
}

export default { getAllSessions, getSession, createSession, updateSession, deleteSession, getMessagesBySession, createMessage, updateMessage, deleteMessage, createMessages, clearAllData };
