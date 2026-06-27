import { useState, useRef, useEffect, useCallback } from 'react';
import { Model, Session, PermissionMode, CustomAgent, PermissionRequest } from '../types';
import { NewChatView } from '../components/NewChatView';
import { ChatMessages } from '../components/ChatMessages';
import { ChatInput } from '../components/ChatInput';

interface NewChatOptions {
  agentId: string;
  cwd: string;
  permissionMode: PermissionMode;
}

interface WelcomeInfo {
  title: string;
  desc: string;
  suggestions: string[];
}

interface ChatPageProps {
  currentSession: Session | undefined;
  models: Model[];
  selectedModel: string;
  agents: CustomAgent[];
  isLoading: boolean;
  inputValue: string;
  permissionRequest: PermissionRequest | null;
  permissionMode: PermissionMode;
  onSendMessage: (message: string, newChatOptions?: NewChatOptions, onNavigate?: (path: string) => void) => void;
  onStop: () => void;
  onInputChange: (value: string) => void;
  onModelChange: (modelId: string) => void;
  onPermissionAllow: () => void;
  onPermissionDeny: () => void;
  onPermissionModeChange: (mode: PermissionMode) => void;
  /** 锁定 Agent：新建会话固定使用该 Agent，不显示选择器 */
  lockedAgent?: CustomAgent;
  /** 锁定模式下的欢迎语与引导提示 */
  welcome?: WelcomeInfo;
  /** 新建会话后导航到的路径（由模块提供，例如 /assistant/:id） */
  onAfterCreate?: (path: string) => void;
}

export function ChatPage({
  currentSession,
  models,
  selectedModel,
  agents,
  isLoading,
  inputValue,
  permissionRequest,
  permissionMode,
  onSendMessage,
  onStop,
  onInputChange,
  onModelChange,
  onPermissionAllow,
  onPermissionDeny,
  onPermissionModeChange,
  lockedAgent,
  welcome,
  onAfterCreate,
}: ChatPageProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 新对话页面状态
  const defaultAgentId = lockedAgent?.id || 'default';
  const [newChatAgentId, setNewChatAgentId] = useState(defaultAgentId);
  const [newChatCwd, setNewChatCwd] = useState('');

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages]);

  // 处理发送消息
  const handleSend = useCallback(
    (message: string) => {
      if (!currentSession) {
        onSendMessage(
          message,
          {
            agentId: lockedAgent?.id || newChatAgentId,
            cwd: newChatCwd,
            permissionMode: permissionMode,
          },
          (path) => {
            if (!lockedAgent) setNewChatAgentId('default');
            setNewChatCwd('');
            onAfterCreate?.(path);
          }
        );
      } else {
        onSendMessage(message);
      }
    },
    [currentSession, lockedAgent, newChatAgentId, newChatCwd, permissionMode, onSendMessage, onAfterCreate]
  );

  const showNewChatView = !currentSession || currentSession.messages.length === 0;

  return (
    <>
      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto p-6">
        {showNewChatView ? (
          <NewChatView
            agents={agents}
            models={models}
            selectedModel={selectedModel}
            newChatAgentId={newChatAgentId}
            newChatCwd={newChatCwd}
            newChatPermissionMode={permissionMode}
            onSelectModel={onModelChange}
            onSelectAgent={setNewChatAgentId}
            onSetCwd={setNewChatCwd}
            onSetPermissionMode={onPermissionModeChange}
            lockedAgent={lockedAgent}
            welcome={welcome}
            onPickSuggestion={onInputChange}
          />
        ) : (
          <ChatMessages
            messages={currentSession!.messages}
            models={models}
            availableSkills={currentSession!.availableSkills}
            mcpServers={currentSession!.mcpServers}
            messagesEndRef={messagesEndRef}
            permissionRequest={permissionRequest}
            onPermissionAllow={onPermissionAllow}
            onPermissionDeny={onPermissionDeny}
          />
        )}
      </div>

      {/* 输入区域 */}
      <ChatInput
        inputValue={inputValue}
        selectedModel={selectedModel}
        models={models}
        isLoading={isLoading}
        permissionMode={permissionMode}
        onSend={handleSend}
        onStop={onStop}
        onChange={onInputChange}
        onModelChange={onModelChange}
        onPermissionModeChange={onPermissionModeChange}
      />
    </>
  );
}
