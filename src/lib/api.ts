// 统一的前端鉴权工具：管理 JWT（localStorage），并为所有 /api 请求自动注入 Authorization 头。
// 通过 patch 全局 fetch，避免逐个改造 9 处 fetch 调用。

const TOKEN_KEY = 'authToken';
const USER_KEY = 'authUser';

export interface AuthUserInfo {
  id: string;
  username: string;
  email?: string | null;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getUser(): AuthUserInfo | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function setUser(user: AuthUserInfo): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

// 是否为需要鉴权的同源 API 请求
function isApiUrl(url: string): boolean {
  return url.startsWith('/api/') || url.includes('://') === false && url.startsWith('/api');
}

let patched = false;

// patch 全局 fetch：自动加 Authorization 头；遇到 401 清除登录态并跳转登录页
export function installFetchAuth(): void {
  if (patched) return;
  patched = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url = '';
    if (typeof input === 'string') url = input;
    else if (input instanceof URL) url = input.pathname;
    else url = (input as Request).url;

    // 仅对同源 /api 请求注入 token（不动 /api/auth/login、/api/auth/register）
    const needsAuth = isApiUrl(url) && !url.includes('/api/auth/login') && !url.includes('/api/auth/register');
    const token = getToken();

    if (needsAuth && token) {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      init = { ...init, headers };
    }

    const res = await originalFetch(input as any, init);

    // 鉴权失败：清登录态并跳转（避免在登录页自身重复跳转）
    if (res.status === 401 && needsAuth && !window.location.pathname.startsWith('/login')) {
      clearAuth();
      window.location.href = '/login';
    }
    return res;
  };
}

// 提供 token 给无法走 fetch 的场景（如 EventSource/WebSocket），以 query 参数携带
export function withTokenQuery(url: string): string {
  const token = getToken();
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}
