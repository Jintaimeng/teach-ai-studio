# ---------- Build stage: 构建前端静态产物 dist/ ----------
FROM node:20-slim AS builder

WORKDIR /app

# 原生模块(better-sqlite3)编译所需工具
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

# 仅构建前端（后端运行期由 tsx 直接跑 TS）
RUN npm run build

# ---------- Runtime stage ----------
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# 运行期同样需要原生模块的编译链（npm ci 会编译 better-sqlite3）
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
# 安装全部依赖（含 tsx 等 devDeps，运行期需要 tsx 直接执行 TS）
RUN npm ci && npm cache clean --force

# 拷贝运行期所需的后端源码与构建产物（前端已构建进 dist，运行期无需 src）
COPY server ./server
COPY mcp ./mcp
COPY mcp.docker.json ./mcp.docker.json
COPY tsconfig*.json ./
COPY --from=builder /app/dist ./dist
# 预置只读数据（如 yanbot.db），如不存在则忽略
COPY data ./data

# data 目录需可写（chat.db / WAL），并切换到非 root 用户
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

ENV PORT=3000
ENV MCP_CONFIG_PATH=/app/mcp.docker.json
EXPOSE 3000

CMD ["npm", "run", "server"]
