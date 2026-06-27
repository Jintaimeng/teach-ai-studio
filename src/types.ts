/**
 * 类型定义
 */

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

export interface Model {
  modelId: string;
  name: string;
  description?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input?: Record<string, unknown>;
  status: 'running' | 'completed' | 'error';
  result?: string;
  isError?: boolean;
}

export interface AvailableSkill {
  name: string;
  description?: string;
  argumentHint?: string;
}

export interface McpServerState {
  name: string;
  status: 'connected' | 'failed' | 'needs-auth' | 'pending' | string;
}

export interface McpToolInfo {
  name: string;
  description?: string;
}

export interface McpServerInfo {
  name: string;
  type?: string;
  enabled: boolean;
  status: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled' | string;
  tools: McpToolInfo[];
}

/**
 * 内容块类型 - 支持文字和工具调用按顺序排列
 */
export type ContentBlock = 
  | { type: 'text'; text: string }
  | { type: 'tool_use'; toolCall: ToolCall };

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;  // 保留用于兼容，存储纯文本摘要
  model?: string;
  timestamp: Date;
  isStreaming?: boolean;
  thinking?: string;
  toolCalls?: ToolCall[];  // 保留用于兼容
  contentBlocks?: ContentBlock[];  // 新增：按顺序排列的内容块
}

export interface Session {
  id: string;
  title: string;
  model: string;
  agentId?: string;
  cwd?: string;
  permissionMode?: PermissionMode;
  availableSkills?: AvailableSkill[];
  mcpServers?: McpServerState[];
  createdAt: Date;
  messages: Message[];
}

export interface CustomAgent {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  icon?: string;
  color?: string;
  permissionMode?: PermissionMode;
  createdAt: Date;
  updatedAt: Date;
}

// Agent 是 CustomAgent 的别名
export type Agent = CustomAgent;

export type Theme = 'light' | 'dark';

/**
 * 权限请求 - 用于工具调用确认
 */
export interface PermissionRequest {
  requestId: string;
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  sessionId: string;
  timestamp: number;
}

/**
 * 权限响应
 */
export interface PermissionResponse {
  requestId: string;
  behavior: 'allow' | 'deny';
  message?: string;
}

/* ===================== 志愿推荐 ===================== */

export interface ScoreBand {
  firstMin: number;
  firstMax: number;
  adjustMax: number;
}

export interface ParsedQuery {
  score: number | null;
  subjectName?: string;
  provinceName?: string;
  level?: string | null;
  targetSchoolName?: string;
  year?: number | null;
  band: ScoreBand;
  note?: string;
}

export interface FilterDelta {
  firstMinDelta?: number;
  firstMaxDelta?: number;
  adjustMaxDelta?: number;
  level?: string | null;
}

export interface SchoolCard {
  schoolName: string;
  schoolCode: string;
  level?: string;
  provinceName?: string;
  subjectName: string;
  subjectCode: string;
  college?: string;
  year: number;
  lowestScore?: number;
  averageScore?: number;
  highestScore?: number;
  admissions?: number;
  applicants?: number | string;
  remarks?: string;
  scoreDiff?: number;
  tier?: '冲' | '稳' | '保';
  is985?: boolean;
  is211?: boolean;
  isDualClass?: boolean;
}

export interface RecommendGroup {
  category: '一志愿' | '调剂';
  items: SchoolCard[];
}

export interface RecommendResult {
  parsedQuery: ParsedQuery;
  groups: RecommendGroup[];
  note?: string;
}

export interface FavoriteCaseSummary {
  id: string;
  title: string;
  candidateSummary?: string | null;
  note?: string | null;
  createdAt: string;
}

export interface FavoriteCaseDetail extends FavoriteCaseSummary {
  query: ParsedQuery;
  result: RecommendResult;
}
