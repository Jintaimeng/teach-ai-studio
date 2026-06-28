# 部署指南（CI/CD · Docker）

本项目参考 `yanbot-claw` 的 Docker CI/CD 范式：**push 触发 GitHub Actions → 构建并推送镜像到自建 Registry → SCP 配置到服务器 → SSH 执行部署脚本（健康检查 + 失败自动回滚）**。

## 分支与环境

| 分支 | 环境 | 服务器目录 | 端口 | 镜像标签 |
|---|---|---|---|---|
| `main` | Production | `/www/teach-ai-studio-production` | `3002:3000` | `production-latest` / `production-<sha>` |
| `staging` | Staging | `/www/teach-ai-studio-staging` | `3001:3000` | `staging-latest` / `staging-<sha>` |

两套 workflow 也支持在 Actions 页面手动触发（`workflow_dispatch`）。

## 一、GitHub Secrets（仓库 Settings → Secrets and variables → Actions）

### 通用（两个环境共用）
| Secret | 说明 |
|---|---|
| `DOCKER_USERNAME` | 自建 Registry `docker.niuy.xyz` 的用户名 |
| `DOCKER_PASSWORD` | 自建 Registry 的密码 |

### Production 服务器
| Secret | 说明 |
|---|---|
| `STUDIO_PROD_HOST` | 服务器 IP / 域名 |
| `STUDIO_PROD_USER` | SSH 用户名 |
| `STUDIO_PROD_PWD` | SSH 密码 |
| `STUDIO_PROD_PORT` | SSH 端口（通常 22） |

### Staging 服务器
| Secret | 说明 |
|---|---|
| `STUDIO_STAGING_HOST` | 服务器 IP / 域名 |
| `STUDIO_STAGING_USER` | SSH 用户名 |
| `STUDIO_STAGING_PWD` | SSH 密码 |
| `STUDIO_STAGING_PORT` | SSH 端口 |

> 镜像名固定为 `docker.niuy.xyz/<DOCKER_USERNAME>/teach-ai-studio`，在 workflow 的 `env.IMAGE_NAME` 中拼装。

## 二、服务器一次性准备

以 Production 为例（Staging 把 `production` 换成 `staging`、端口换 3001）：

```bash
# 1. 安装 Docker + docker compose 插件（略）

# 2. 创建部署目录
mkdir -p /www/teach-ai-studio-production/{env,data,logs}

# 3. 创建运行时环境变量文件（密钥不进镜像、不进仓库）
vim /www/teach-ai-studio-production/env/.env.production
```

`.env.production` 内容（参考仓库根目录 `.env.example`）：
```bash
CODEBUDDY_API_KEY=ck_xxx
# 多用户鉴权密钥：务必改为高强度随机值
JWT_SECRET=<openssl rand -hex 32 生成>
JWT_EXPIRES_IN=7d
AGENT_MAX_CONCURRENCY=20
# yanbot / 豆包 / 火山 等按需填写
OPEN_API_KEY=
OPEN_API_SECRET=
DOUBAO_API_KEY=
VOLC_ASR_API_KEY=
```

> `data/yanbot.db`（只读参考库）无需手动准备：部署脚本首次运行会自动从镜像中提取一份到 `data/`。如自动提取失败，再手动上传。

## 三、首次部署

1. 在仓库配置好上述 Secrets。
2. 把代码推到对应分支：
   - `git push origin main` → 触发 Production
   - `git push origin staging` → 触发 Staging
3. Actions 自动完成：构建镜像 → 推送 → SCP compose+脚本 → SSH 执行部署脚本。
4. 部署脚本会等待容器 `healthy` 并探测 `/api/health`，失败则自动回滚到上一个镜像。

## 四、访问与反向代理

容器对外暴露 `3002`（prod）/ `3001`（staging）。生产建议在服务器前置 nginx 做 TLS + 域名，并按仓库根目录 `nginx.conf` 配置 **SSE 关闭缓冲、WebSocket 升级头、长超时**（聊天 `/api/chat` 与语音 `/api/asr` 必需）。

## 五、关键约束（务必遵守）

- **单实例**：数据库为 better-sqlite3 单文件库（WAL），`docker compose` 切勿 `scale >1`，多副本会互相覆盖损坏数据。
- **data 卷可写且需持久化**：`./data` bind mount 保存 `chat.db`（用户数据）与 `yanbot.db`（只读参考库），不可丢。
- **密钥只在服务器 `env/.env.*`**：不进镜像、不进仓库。
- **JWT_SECRET 必改**：默认值不安全，生产必须设置随机值。

## 六、本地手动构建验证（可选）

```bash
docker build -t teach-ai-studio:local .
docker run --rm -p 3000:3000 --env-file .env -v "$PWD/data:/app/data" teach-ai-studio:local
# 浏览器访问 http://localhost:3000 ，注册→登录→聊天
```
