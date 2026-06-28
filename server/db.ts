import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库文件路径
const dbPath = path.join(__dirname, '..', 'data', 'chat.db');
const dataDir = path.dirname(dbPath);

let db: Database.Database;
let dbReady = false;

// 类型定义
export interface DbUser {
  id: string;
  username: string;
  password_hash: string;
  email: string | null;
  created_at: string;
}

export interface DbSession {
  id: string;
  user_id?: string | null;
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

export interface DbFavoriteCase {
  id: string;
  user_id?: string | null;
  title: string;
  candidate_summary: string | null;
  query_json: string;
  result_json: string;
  note: string | null;
  created_at: string;
}

export interface DbPromoCopy {
  id: string;
  user_id?: string | null;
  title: string;
  content: string;
  feed_ids: string | null;       // JSON: 选中的资讯 id 数组
  feed_snapshot: string | null;  // JSON: 生成时的资讯标题/来源快照
  favorite: number;              // 0 / 1
  created_at: string;
}

// ============= 数据库初始化 =============

function initDatabase(): void {
  if (dbReady) return;

  // 确保 data 目录存在
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(dbPath);
  // WAL 模式：支持并发读 + 串行写，去掉 sql.js 的整库落盘瓶颈
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  console.log('[DB] Opened better-sqlite3 database (WAL) at', dbPath);

  // 用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT,
      created_at TEXT NOT NULL
    )
  `);

  // 会话表
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      model TEXT NOT NULL,
      sdk_session_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.exec(`
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

  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)');

  // 收藏案例表（志愿推荐结果）
  db.exec(`
    CREATE TABLE IF NOT EXISTS favorite_cases (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      candidate_summary TEXT,
      query_json TEXT NOT NULL,
      result_json TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    )
  `);

  // 推广文案表（推广神器生成结果）
  db.exec(`
    CREATE TABLE IF NOT EXISTS promo_copies (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      feed_ids TEXT,
      feed_snapshot TEXT,
      favorite INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  // 每用户 MCP 配置
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_mcp_config (
      user_id TEXT PRIMARY KEY,
      config_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 每用户 skill 配置
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_skills (
      user_id TEXT PRIMARY KEY,
      config_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  runMigrations();

  dbReady = true;
}

// 迁移：补列（沿用旧库已有数据时安全加列）
function runMigrations(): void {
  const hasColumn = (table: string, column: string): boolean => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return cols.some((c) => c.name === column);
  };

  // sessions.sdk_session_id（旧库迁移先例）
  if (!hasColumn('sessions', 'sdk_session_id')) {
    db.exec('ALTER TABLE sessions ADD COLUMN sdk_session_id TEXT');
    console.log('[DB] Added sdk_session_id column to sessions');
  }

  // 多租户：给业务表补 user_id 列
  for (const table of ['sessions', 'favorite_cases', 'promo_copies']) {
    if (!hasColumn(table, 'user_id')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN user_id TEXT`);
      console.log(`[DB] Added user_id column to ${table}`);
    }
  }
  // 加速按用户过滤
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_favorite_cases_user_id ON favorite_cases(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_promo_copies_user_id ON promo_copies(user_id)');
}

// 确保数据库就绪（保持 async 签名，兼容 index.ts 现有 await 调用）
async function ensureDb(): Promise<Database.Database> {
  if (!dbReady) initDatabase();
  return db;
}

// ============= 查询辅助函数 =============

function all(sql: string, params: any[] = []): any[] {
  return db.prepare(sql).all(...params);
}

function get(sql: string, params: any[] = []): any {
  return db.prepare(sql).get(...params);
}

function run(sql: string, params: any[] = []): void {
  db.prepare(sql).run(...params);
}

// ============= 用户操作 =============

export async function createUser(user: DbUser): Promise<DbUser> {
  await ensureDb();
  run(
    'INSERT INTO users (id, username, password_hash, email, created_at) VALUES (?, ?, ?, ?, ?)',
    [user.id, user.username, user.password_hash, user.email, user.created_at]
  );
  return user;
}

export async function getUserByUsername(username: string): Promise<DbUser | undefined> {
  await ensureDb();
  return get('SELECT * FROM users WHERE username = ?', [username]) as DbUser | undefined;
}

export async function getUserById(id: string): Promise<DbUser | undefined> {
  await ensureDb();
  return get('SELECT * FROM users WHERE id = ?', [id]) as DbUser | undefined;
}

// ============= 会话操作（按 user_id 隔离）=============

export async function getAllSessions(userId: string): Promise<DbSession[]> {
  await ensureDb();
  return all('SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC', [userId]) as DbSession[];
}

export async function getSession(id: string, userId: string): Promise<DbSession | undefined> {
  await ensureDb();
  return get('SELECT * FROM sessions WHERE id = ? AND user_id = ?', [id, userId]) as DbSession | undefined;
}

export async function createSession(session: DbSession): Promise<DbSession> {
  await ensureDb();
  run(
    'INSERT INTO sessions (id, user_id, title, model, sdk_session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [session.id, session.user_id ?? null, session.title, session.model, session.sdk_session_id, session.created_at, session.updated_at]
  );
  return session;
}

export async function updateSession(
  id: string,
  userId: string,
  updates: Partial<Pick<DbSession, 'title' | 'model' | 'sdk_session_id'>>
): Promise<boolean> {
  await ensureDb();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
  if (updates.model !== undefined) { fields.push('model = ?'); values.push(updates.model); }
  if (updates.sdk_session_id !== undefined) { fields.push('sdk_session_id = ?'); values.push(updates.sdk_session_id); }

  if (fields.length === 0) return false;

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  values.push(userId);

  run(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
  return true;
}

export async function deleteSession(id: string, userId: string): Promise<boolean> {
  await ensureDb();
  // 仅当 session 属于该用户时删除其消息与会话
  const owned = get('SELECT id FROM sessions WHERE id = ? AND user_id = ?', [id, userId]);
  if (!owned) return false;
  run('DELETE FROM messages WHERE session_id = ?', [id]);
  run('DELETE FROM sessions WHERE id = ? AND user_id = ?', [id, userId]);
  return true;
}

// ============= 消息操作（经 session 归属校验）=============

export async function getMessagesBySession(sessionId: string, userId: string): Promise<DbMessage[]> {
  await ensureDb();
  const owned = get('SELECT id FROM sessions WHERE id = ? AND user_id = ?', [sessionId, userId]);
  if (!owned) return [];
  return all('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC', [sessionId]) as DbMessage[];
}

export async function createMessage(message: DbMessage): Promise<DbMessage> {
  await ensureDb();
  run(
    'INSERT INTO messages (id, session_id, role, content, model, created_at, tool_calls) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [message.id, message.session_id, message.role, message.content, message.model, message.created_at, message.tool_calls]
  );
  run('UPDATE sessions SET updated_at = ? WHERE id = ?', [new Date().toISOString(), message.session_id]);
  return message;
}

export async function updateMessage(
  id: string,
  updates: Partial<Pick<DbMessage, 'content' | 'tool_calls'>>
): Promise<boolean> {
  await ensureDb();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.content !== undefined) { fields.push('content = ?'); values.push(updates.content); }
  if (updates.tool_calls !== undefined) { fields.push('tool_calls = ?'); values.push(updates.tool_calls); }

  if (fields.length === 0) return false;

  values.push(id);
  run(`UPDATE messages SET ${fields.join(', ')} WHERE id = ?`, values);
  return true;
}

export async function deleteMessage(id: string): Promise<boolean> {
  await ensureDb();
  run('DELETE FROM messages WHERE id = ?', [id]);
  return true;
}

export async function createMessages(messages: DbMessage[]): Promise<void> {
  await ensureDb();
  const insert = db.prepare(
    'INSERT INTO messages (id, session_id, role, content, model, created_at, tool_calls) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const tx = db.transaction((rows: DbMessage[]) => {
    for (const m of rows) {
      insert.run(m.id, m.session_id, m.role, m.content, m.model, m.created_at, m.tool_calls);
    }
  });
  tx(messages);
}

export async function clearAllData(userId: string): Promise<void> {
  await ensureDb();
  // 仅清除该用户的会话及其消息
  const ids = all('SELECT id FROM sessions WHERE user_id = ?', [userId]) as Array<{ id: string }>;
  const delMsg = db.prepare('DELETE FROM messages WHERE session_id = ?');
  const tx = db.transaction(() => {
    for (const { id } of ids) delMsg.run(id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  });
  tx();
}

// ============= 收藏案例操作（按 user_id 隔离）=============

export async function getAllFavoriteCases(userId: string): Promise<DbFavoriteCase[]> {
  await ensureDb();
  return all('SELECT * FROM favorite_cases WHERE user_id = ? ORDER BY created_at DESC', [userId]) as DbFavoriteCase[];
}

export async function getFavoriteCase(id: string, userId: string): Promise<DbFavoriteCase | undefined> {
  await ensureDb();
  return get('SELECT * FROM favorite_cases WHERE id = ? AND user_id = ?', [id, userId]) as DbFavoriteCase | undefined;
}

export async function createFavoriteCase(item: DbFavoriteCase): Promise<DbFavoriteCase> {
  await ensureDb();
  run(
    'INSERT INTO favorite_cases (id, user_id, title, candidate_summary, query_json, result_json, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [item.id, item.user_id ?? null, item.title, item.candidate_summary, item.query_json, item.result_json, item.note, item.created_at]
  );
  return item;
}

export async function deleteFavoriteCase(id: string, userId: string): Promise<boolean> {
  await ensureDb();
  run('DELETE FROM favorite_cases WHERE id = ? AND user_id = ?', [id, userId]);
  return true;
}

// ============= 推广文案操作（按 user_id 隔离）=============

export async function getAllPromoCopies(userId: string): Promise<DbPromoCopy[]> {
  await ensureDb();
  return all('SELECT * FROM promo_copies WHERE user_id = ? ORDER BY created_at DESC', [userId]) as DbPromoCopy[];
}

export async function getPromoCopy(id: string, userId: string): Promise<DbPromoCopy | undefined> {
  await ensureDb();
  return get('SELECT * FROM promo_copies WHERE id = ? AND user_id = ?', [id, userId]) as DbPromoCopy | undefined;
}

export async function createPromoCopy(item: DbPromoCopy): Promise<DbPromoCopy> {
  await ensureDb();
  run(
    'INSERT INTO promo_copies (id, user_id, title, content, feed_ids, feed_snapshot, favorite, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [item.id, item.user_id ?? null, item.title, item.content, item.feed_ids, item.feed_snapshot, item.favorite, item.created_at]
  );
  return item;
}

export async function setPromoCopyFavorite(id: string, userId: string, favorite: boolean): Promise<boolean> {
  await ensureDb();
  run('UPDATE promo_copies SET favorite = ? WHERE id = ? AND user_id = ?', [favorite ? 1 : 0, id, userId]);
  return true;
}

export async function deletePromoCopy(id: string, userId: string): Promise<boolean> {
  await ensureDb();
  run('DELETE FROM promo_copies WHERE id = ? AND user_id = ?', [id, userId]);
  return true;
}

// ============= 每用户 MCP / skill 配置 =============

export async function getUserMcpConfig(userId: string): Promise<any | null> {
  await ensureDb();
  const row = get('SELECT config_json FROM user_mcp_config WHERE user_id = ?', [userId]) as { config_json: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.config_json); } catch { return null; }
}

export async function setUserMcpConfig(userId: string, config: any): Promise<void> {
  await ensureDb();
  run(
    `INSERT INTO user_mcp_config (user_id, config_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at`,
    [userId, JSON.stringify(config), new Date().toISOString()]
  );
}

export async function getUserSkills(userId: string): Promise<any | null> {
  await ensureDb();
  const row = get('SELECT config_json FROM user_skills WHERE user_id = ?', [userId]) as { config_json: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.config_json); } catch { return null; }
}

export async function setUserSkills(userId: string, config: any): Promise<void> {
  await ensureDb();
  run(
    `INSERT INTO user_skills (user_id, config_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at`,
    [userId, JSON.stringify(config), new Date().toISOString()]
  );
}

export default {
  createUser, getUserByUsername, getUserById,
  getAllSessions, getSession, createSession, updateSession, deleteSession,
  getMessagesBySession, createMessage, updateMessage, deleteMessage, createMessages, clearAllData,
  getAllFavoriteCases, getFavoriteCase, createFavoriteCase, deleteFavoriteCase,
  getAllPromoCopies, getPromoCopy, createPromoCopy, setPromoCopyFavorite, deletePromoCopy,
  getUserMcpConfig, setUserMcpConfig, getUserSkills, setUserSkills,
};
