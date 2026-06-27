# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A Web Agent application template built on the **CodeBuddy Agent SDK** (`@tencent-ai/agent-sdk`). It is a chat UI with streaming responses, tool-call visualization, interactive permission prompts, multi-session management, custom agents, MCP servers, and skills. The backend is an Express server that wraps the SDK's `query()` API; the frontend is a React + TDesign SPA.

Note: docs in this repo are written in Chinese (README.md, DEVELOPMENT.md). DEVELOPMENT.md is a detailed second-development guide worth consulting for API reference and customization recipes.

## Commands

```bash
npm install          # install dependencies
npm run dev          # run frontend (Vite :5173) AND backend (:3000) concurrently
npm run dev:server   # backend only — node --import tsx/esm server/index.ts
npm run dev:client   # frontend only — vite
npm run build        # tsc -b && vite build
npm run preview      # preview production build
```

There is **no test runner or linter configured**. `test-chat.mjs` and `test-sdk.mjs` are standalone manual SDK smoke scripts (`node test-sdk.mjs`), not a test suite.

Develop against `http://localhost:5173`; Vite proxies `/api/*` to the backend on `:3000` (see `vite.config.ts`).

## Authentication

The SDK needs credentials, supplied via env vars (copy `.env.example` → `.env`):
- `CODEBUDDY_API_KEY` (preferred) or `CODEBUDDY_AUTH_TOKEN`
- `CODEBUDDY_INTERNET_ENVIRONMENT` (defaults to `external`), optional `CODEBUDDY_BASE_URL`
- `PORT` (backend, default 3000)

Credentials can also be set at runtime via the Settings page (`POST /api/save-env-config`), but those only live in the running process and are lost on restart. If env vars are absent, the server falls back to CLI auth via `unstable_v2_authenticate`. `getSdkEnv()` in `server/index.ts` is the single place that assembles the env passed to every SDK call (it always sets `SERVER__PORT=0` so the spawned CLI picks a random port and avoids conflicts).

## Architecture

### Backend (`server/`)
- **`index.ts`** — all Express routes plus the SDK integration. The core is `POST /api/chat`: it calls the SDK `query()` and relays the async-iterable message stream to the client as **Server-Sent Events (SSE)**. SDK message types are translated into SSE event types: `init`, `metadata`, `text`, `thinking`, `tool`, `tool_result`, `permission_request`, `done`, `error`.
- **`db.ts`** — persistence via **`sql.js`** (WASM SQLite), NOT `better-sqlite3` (the README/DEVELOPMENT.md say better-sqlite3, but the code uses sql.js). The DB lives entirely in memory and is serialized to `data/chat.db` on disk after **every write** (`persistToDisk` / `afterWrite`). Two tables: `sessions` and `messages`. All exported functions are async and call `ensureDb()` first.
- `.js`/`.d.ts` files next to the `.ts` sources are build artifacts — edit the `.ts` files only.

### Frontend (`src/`)
- `App.tsx` — routes (`/`, `/chat/:sessionId`, `/settings`) and wires together the hooks. `main.tsx` is the entry.
- **State lives in hooks** (`src/hooks/`): `useChat` (the big one — sends messages, parses the SSE stream, manages tool calls and permission requests), `useSessions`, `useAgents`, `useModels`, `useTheme`.
- `pages/ChatPage.tsx`, `components/*` — UI. UI is **TDesign React** (`tdesign-react`, `@tdesign-react/chat`) styled with **Tailwind** + TDesign CSS variables (e.g. `var(--td-bg-color-page)`).

### Where data lives (important)
- **Sessions and messages → server-side SQLite** (`data/chat.db`).
- **Custom agents, per-session model choice, draft input → browser `localStorage`** (keys `customAgents`, `sessionModels`, `draftInput`). Agents are a purely client-side concept; the server never sees them except as a `systemPrompt` string passed per request. The `default` agent ("通用助手") is hardcoded in `useAgents.ts` and cannot be deleted.

### Conversation continuity (resume)
The SDK returns its own `session_id` in the `init` message. The server stores it in the `sessions.sdk_session_id` column and passes it as `resume` to subsequent `query()` calls so the SDK reconstructs prior context. The app's own session id and the SDK's session id are distinct — don't conflate them.

### Permission flow
When `permissionMode` is not `bypassPermissions`, the SDK's `canUseTool` callback creates a pending request (stored in the in-memory `pendingPermissions` map), emits a `permission_request` SSE event, and **blocks on a Promise** until the client calls `POST /api/permission-response` (or it times out after 5 min). Modes: `default`, `acceptEdits`, `plan`, `bypassPermissions`.

### MCP & Skills
- MCP servers are configured in **`mcp.json`** at the repo root (read via `loadMcpServers`). Servers with `"disabled": true` are filtered out. The config is editable/toggleable at runtime through `/api/mcp/config` and `/api/mcp/servers/:name`, and `inspectMcpServers` runs a throwaway `query()` to fetch live connection status + tool lists (cached 30s).
- Skills are discovered from the SDK `init` message (`skills` / `slash_commands`), cached in `lastAvailableSkills`, and injected into the system prompt by `buildSystemPrompt` so the model proactively triggers the matching `/skill` command.

> Gotcha: the committed `mcp.json` references stdio MCP servers via **absolute Windows paths** (`C:/Users/niuyi/...`) that won't exist in a fresh checkout. The actual server scripts are in `mcp/`; fix the paths or disable those entries before relying on them.

## Conventions
- ESM throughout (`"type": "module"`); TypeScript is run directly via `tsx`, not pre-compiled for dev.
- The SDK is used through three entry points: `query()` (streaming chat / inspection), `unstable_v2_createSession()` (model listing), `unstable_v2_authenticate()` (login check).
- App display name/version are centralized in `src/config.ts` (`APP_CONFIG`).
