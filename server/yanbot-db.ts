import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 志愿填报数据库（只读）。
 *
 * 数据来源：yanbot-claw 导入脚本生成的 data/yanbot.db（表 schools / admissions）。
 * 与聊天库（server/db.ts 的 chat.db）完全独立，互不影响。
 */

const dbPath = path.join(__dirname, '..', 'data', 'yanbot.db');

let db: SqlJsDatabase | null = null;
let SQL: SqlJsStatic;
let initPromise: Promise<void> | null = null;

async function initDatabase(): Promise<void> {
  SQL = await initSqlJs({
    locateFile: (file: string) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file),
  });

  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `[yanbot-db] 未找到数据库文件: ${dbPath}。请先用 yanbot-claw 的导入脚本生成 yanbot.db 并复制到 data/ 目录。`
    );
  }

  const fileBuffer = fs.readFileSync(dbPath);
  db = new SQL.Database(fileBuffer);
  console.log('[yanbot-db] Loaded admissions database from', dbPath);
}

/** 确保数据库已加载（幂等）。路由处理前调用。 */
export async function ensureYanbotDb(): Promise<void> {
  if (!initPromise) {
    initPromise = initDatabase().catch((err) => {
      // 允许下次重试
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
}

/**
 * 执行参数化查询，返回行对象数组。
 * 用于替代 better-sqlite3 的 `db.prepare(sql).all(...params)`。
 */
export function queryAll<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = []
): T[] {
  if (!db) {
    throw new Error('[yanbot-db] 数据库尚未初始化，请先 await ensureYanbotDb()');
  }
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params as (string | number | null)[]);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    return rows;
  } finally {
    stmt.free();
  }
}
