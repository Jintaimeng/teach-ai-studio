/** 确保数据库已加载（幂等）。路由处理前调用。 */
export declare function ensureYanbotDb(): Promise<void>;
/**
 * 执行参数化查询，返回行对象数组。
 * 用于替代 better-sqlite3 的 `db.prepare(sql).all(...params)`。
 */
export declare function queryAll<T = Record<string, unknown>>(sql: string, params?: (string | number | null)[]): T[];
