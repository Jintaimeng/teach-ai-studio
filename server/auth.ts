import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import * as db from "./db.js";

// JWT 密钥：生产环境必须通过环境变量提供；缺省仅用于本地开发
const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

if (!process.env.JWT_SECRET) {
  console.warn("[Auth] ⚠️ 未设置 JWT_SECRET，正在使用不安全的默认密钥，请在生产环境配置 JWT_SECRET 环境变量");
}

export interface AuthUser {
  id: string;
  username: string;
}

// 扩展 Express Request，挂载 user
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

function verifyToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload && typeof payload.id === "string") {
      return { id: payload.id, username: payload.username };
    }
    return null;
  } catch {
    return null;
  }
}

// 从请求中提取 token：优先 Authorization: Bearer，其次 query.token（用于 EventSource/SSE 无法设置头的场景）
function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    return header.slice(7);
  }
  const q = req.query?.token;
  if (typeof q === "string" && q.length > 0) return q;
  return null;
}

// 鉴权中间件：校验 JWT，注入 req.user，否则 401
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "未登录或缺少凭证" });
    return;
  }
  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: "凭证无效或已过期" });
    return;
  }
  req.user = user;
  next();
}

// ============= 注册 / 登录 处理 =============

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

export async function handleRegister(req: Request, res: Response): Promise<void> {
  try {
    const { username, password, email } = req.body || {};
    if (typeof username !== "string" || !USERNAME_RE.test(username)) {
      res.status(400).json({ error: "用户名需为 3-32 位字母、数字或下划线" });
      return;
    }
    if (typeof password !== "string" || password.length < 6) {
      res.status(400).json({ error: "密码至少 6 位" });
      return;
    }
    const existing = await db.getUserByUsername(username);
    if (existing) {
      res.status(409).json({ error: "用户名已被占用" });
      return;
    }
    const password_hash = await bcrypt.hash(password, 10);
    const user = {
      id: uuidv4(),
      username,
      password_hash,
      email: typeof email === "string" && email ? email : null,
      created_at: new Date().toISOString(),
    };
    await db.createUser(user);
    const token = signToken({ id: user.id, username: user.username });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (error: any) {
    console.error("[Auth] register error:", error);
    res.status(500).json({ error: error?.message || "注册失败" });
  }
}

export async function handleLogin(req: Request, res: Response): Promise<void> {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "用户名和密码必填" });
      return;
    }
    const user = await db.getUserByUsername(username);
    if (!user) {
      res.status(401).json({ error: "用户名或密码错误" });
      return;
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      res.status(401).json({ error: "用户名或密码错误" });
      return;
    }
    const token = signToken({ id: user.id, username: user.username });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (error: any) {
    console.error("[Auth] login error:", error);
    res.status(500).json({ error: error?.message || "登录失败" });
  }
}

export async function handleMe(req: Request, res: Response): Promise<void> {
  const u = req.user;
  if (!u) {
    res.status(401).json({ error: "未登录" });
    return;
  }
  const full = await db.getUserById(u.id);
  if (!full) {
    res.status(401).json({ error: "用户不存在" });
    return;
  }
  res.json({ user: { id: full.id, username: full.username, email: full.email } });
}
