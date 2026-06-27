import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Tooltip } from 'tdesign-react';
import { AddIcon, DeleteIcon, RefreshIcon } from 'tdesign-icons-react';
import { Bot } from 'lucide-react';
import { ModuleDef } from '../config/modules';
import { CustomAgent, PermissionMode } from '../types';
import { ICON_MAP } from '../utils/iconMap';
import { useAgents } from '../hooks/useAgents';
import { useModels } from '../hooks/useModels';
import { useSessions } from '../hooks/useSessions';
import { useChat } from '../hooks/useChat';
import { ChatPage } from './ChatPage';

interface AssistantPageProps {
  module: ModuleDef;
}

export function AssistantPage({ module }: AssistantPageProps) {
  const navigate = useNavigate();
  const { sessionId: urlSessionId } = useParams<{ sessionId: string }>();
  const preset = module.chat!;

  const { getAgent } = useAgents();
  const { models, selectedModel, setSelectedModel, fetchModels } = useModels();
  const {
    sessions,
    setSessions,
    currentSessionId,
    setCurrentSessionId,
    currentSession,
    sessionModels,
    fetchSessions,
    deleteSession,
    updateSessionModel,
    addSession,
    updateSession,
    updateSessionMessages,
  } = useSessions();

  const [permissionMode, setPermissionMode] = useState<PermissionMode>(preset.permissionMode || 'default');

  // 锁定的模块 Agent：注入模块的 systemPrompt（若提供）
  const lockedAgentId = preset.agentId || 'default';
  const lockedAgent = useMemo<CustomAgent | undefined>(() => {
    const base = getAgent(lockedAgentId);
    if (!base) return undefined;
    return preset.systemPrompt ? { ...base, systemPrompt: preset.systemPrompt } : base;
  }, [getAgent, lockedAgentId, preset.systemPrompt]);

  // 包装 getAgent，使 useChat 取到模块锁定 Agent（含 systemPrompt 覆盖）
  const getModuleAgent = useCallback(
    (id: string) => (id === lockedAgentId && lockedAgent ? lockedAgent : getAgent(id)),
    [getAgent, lockedAgent, lockedAgentId]
  );

  const {
    isLoading,
    inputValue,
    setInputValue,
    permissionRequest,
    sendMessage,
    handleStop,
    handlePermissionAllow,
    handlePermissionDeny,
  } = useChat({
    currentSession,
    currentSessionId,
    selectedModel,
    getAgent: getModuleAgent,
    addSession,
    updateSession,
    updateSessionMessages,
    updateSessionModel,
    setCurrentSessionId,
    setSessions,
    routeBase: module.path,
  });

  // 初次加载会话列表
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // URL <-> currentSessionId 同步
  useEffect(() => {
    if (urlSessionId && urlSessionId !== currentSessionId) {
      setCurrentSessionId(urlSessionId);
    } else if (!urlSessionId && currentSessionId) {
      setCurrentSessionId(null);
    }
  }, [urlSessionId, currentSessionId, setCurrentSessionId]);

  // 切换会话时恢复模型选择
  useEffect(() => {
    if (currentSessionId && sessionModels[currentSessionId]) {
      setSelectedModel(sessionModels[currentSessionId]);
    } else if (currentSession) {
      setSelectedModel(currentSession.model);
    }
  }, [currentSessionId, sessionModels, currentSession, setSelectedModel]);

  const handleModelChange = useCallback(
    (modelId: string) => {
      setSelectedModel(modelId);
      if (currentSessionId) updateSessionModel(currentSessionId, modelId);
    },
    [currentSessionId, setSelectedModel, updateSessionModel]
  );

  const handleNewChat = useCallback(() => {
    setCurrentSessionId(null);
    navigate(module.path);
  }, [navigate, module.path, setCurrentSessionId]);

  const handleSelectSession = useCallback(
    (id: string) => {
      setCurrentSessionId(id);
      navigate(`${module.path}/${id}`);
    },
    [navigate, module.path, setCurrentSessionId]
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      const navigateTo = await deleteSession(id);
      if (navigateTo === '/') navigate(module.path);
      else if (navigateTo) navigate(navigateTo.replace('/chat', module.path));
    },
    [deleteSession, navigate, module.path]
  );

  const ModuleIcon = ICON_MAP[module.icon] || Bot;

  return (
    <div className="flex-1 min-h-0 flex">
      {/* 会话历史面板 */}
      <div
        className="w-60 flex-shrink-0 flex flex-col border-r"
        style={{ backgroundColor: 'var(--td-bg-color-container)', borderColor: 'var(--td-component-stroke)' }}
      >
        <div className="p-3 flex items-center gap-2">
          <Button icon={<AddIcon />} onClick={handleNewChat} block variant="outline">
            新对话
          </Button>
          <Tooltip content="刷新模型列表">
            <Button variant="text" shape="circle" icon={<RefreshIcon />} onClick={fetchModels} />
          </Tooltip>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.length === 0 && (
            <div className="text-xs text-center mt-6" style={{ color: 'var(--td-text-color-placeholder)' }}>
              暂无会话，点击「新对话」开始
            </div>
          )}
          {sessions.map((session) => {
            const isActive = session.id === currentSessionId;
            return (
              <div
                key={session.id}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group"
                style={{
                  backgroundColor: isActive ? 'var(--td-brand-color-light)' : 'transparent',
                  color: isActive ? 'var(--td-brand-color)' : 'var(--td-text-color-secondary)',
                }}
                onClick={() => handleSelectSession(session.id)}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'var(--td-bg-color-component-hover)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div
                  className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center"
                  style={{ backgroundColor: lockedAgent?.color || 'var(--td-brand-color)' }}
                >
                  <ModuleIcon size={12} color="white" />
                </div>
                <span className="flex-1 truncate text-sm">{session.title}</span>
                <Tooltip content="删除会话">
                  <Button
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    variant="text"
                    shape="circle"
                    size="medium"
                    icon={<DeleteIcon />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSession(session.id);
                    }}
                  />
                </Tooltip>
              </div>
            );
          })}
        </div>
      </div>

      {/* 对话区 */}
      <div className="flex-1 min-w-0 flex flex-col">
        <ChatPage
          currentSession={currentSession}
          models={models}
          selectedModel={selectedModel}
          agents={lockedAgent ? [lockedAgent] : []}
          isLoading={isLoading}
          inputValue={inputValue}
          permissionRequest={permissionRequest}
          permissionMode={permissionMode}
          onSendMessage={sendMessage}
          onStop={handleStop}
          onInputChange={setInputValue}
          onModelChange={handleModelChange}
          onPermissionAllow={handlePermissionAllow}
          onPermissionDeny={handlePermissionDeny}
          onPermissionModeChange={setPermissionMode}
          lockedAgent={lockedAgent}
          welcome={{ title: preset.welcomeTitle, desc: preset.welcomeDesc, suggestions: preset.suggestions }}
          onAfterCreate={(path) => navigate(path)}
        />
      </div>
    </div>
  );
}
