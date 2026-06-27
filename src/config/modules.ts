import { PermissionMode } from '../types';

/**
 * 模块注册表 —— 侧栏菜单与路由的单一数据源。
 *
 * 扩展方式：要新增一个 Agent 功能模块（如「智能备课」），
 * 只需在 MODULES 里 push 一条 type:'chat' 的项并填写 chat 预设，
 * 菜单项与路由会自动出现，无需改动外壳或路由文件。
 */

export type ModuleType = 'chat' | 'page' | 'settings';

export interface ChatAgentPreset {
  /** 复用 useAgents 中的 agent；缺省用 'default' */
  agentId?: string;
  /** 锁定的领域提示词（优先于 agentId 对应的 systemPrompt） */
  systemPrompt?: string;
  /** 欢迎页大标题 */
  welcomeTitle: string;
  /** 欢迎页副标题 */
  welcomeDesc: string;
  /** 引导提示（点击即填入输入框） */
  suggestions: string[];
  /** 该模块默认的权限模式 */
  permissionMode?: PermissionMode;
}

export interface ModuleDef {
  id: string;
  label: string;
  /** iconMap key */
  icon: string;
  /** 路由路径 */
  path: string;
  type: ModuleType;
  /** 菜单分组标题，用于侧栏分节 */
  group: string;
  /** 简短描述，用于首页入口卡片 */
  desc?: string;
  /** type==='chat' 时必填 */
  chat?: ChatAgentPreset;
  /** type==='page' 占位模块时使用 */
  placeholder?: { title: string; desc: string };
}

export const MODULES: ModuleDef[] = [
  {
    id: 'home',
    label: '工作台首页',
    icon: 'LayoutDashboard',
    path: '/',
    type: 'page',
    group: '概览',
    desc: '快速进入各功能模块',
  },
  {
    id: 'assistant',
    label: 'AI 助手对话',
    icon: 'Bot',
    path: '/assistant',
    type: 'chat',
    group: '教学',
    desc: '与 AI 教学助手对话，辅助备课与答疑',
    chat: {
      agentId: 'default',
      welcomeTitle: 'AI 教学助手',
      welcomeDesc: '帮你解答教学问题、整理资料、辅助备课',
      suggestions: [
        '帮我设计一节关于光合作用的导入',
        '把这段课文改写成适合小学生的版本',
        '生成 5 道一元二次方程练习题',
      ],
      permissionMode: 'default',
    },
  },
  {
    id: 'recommend',
    label: '志愿推荐',
    icon: 'GraduationCap',
    path: '/recommend',
    type: 'page',
    group: '教学',
    desc: '按考生信息智能推荐一志愿/调剂候选院校',
  },
  {
    id: 'voice-search',
    label: '语音速查',
    icon: 'Mic',
    path: '/voice-search',
    type: 'page',
    group: '教学',
    desc: '直播答疑时按住空格说话，实时检索关键录取数据',
  },
  {
    id: 'cases',
    label: '案例收藏库',
    icon: 'Library',
    path: '/cases',
    type: 'page',
    group: '教学',
    desc: '查看收藏的志愿推荐案例',
  },
  {
    id: 'settings',
    label: '系统设置',
    icon: 'Setting',
    path: '/settings',
    type: 'settings',
    group: '系统',
    desc: '登录配置、MCP 服务与 Agent 管理',
  },
];

/** 根据当前 pathname 匹配模块（前缀匹配，使 /assistant/:id 仍命中 assistant） */
export function matchModule(pathname: string): ModuleDef | undefined {
  // 先精确匹配，再做最长前缀匹配（排除根路径 '/' 的误命中）
  const exact = MODULES.find((m) => m.path === pathname);
  if (exact) return exact;
  const prefixMatches = MODULES.filter(
    (m) => m.path !== '/' && pathname.startsWith(m.path + '/')
  );
  if (prefixMatches.length > 0) {
    return prefixMatches.sort((a, b) => b.path.length - a.path.length)[0];
  }
  return MODULES.find((m) => m.path === '/');
}
