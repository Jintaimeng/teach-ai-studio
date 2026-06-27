import { useState, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Message, ToolCall, PermissionRequest, PermissionMode, Session, CustomAgent, ContentBlock } from '../types';

const STORAGE_KEYS = {
  draftInput: 'draftInput',
};

interface UseChatOptions {
  currentSession: Session | undefined;
  currentSessionId: string | null;
  selectedModel: string;
  getAgent: (id: string) => CustomAgent | undefined;
  addSession: (session: Session) => void;
  updateSession: (sessionId: string, updates: Partial<Session>) => void;
  updateSessionMessages: (sessionId: string, updater: (messages: Message[]) => Message[]) => void;
  updateSessionModel: (sessionId: string, modelId: string) => void;
  setCurrentSessionId: (id: string | null) => void;
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  /** 新建会话后导航路径前缀（默认 /assistant），用于 onNavigate 回调 */
  routeBase?: string;
}

interface NewChatOptions {
  agentId: string;
  cwd: string;
  permissionMode: PermissionMode;
}

export function useChat(options: UseChatOptions) {
  const {
    currentSession,
    currentSessionId,
    selectedModel,
    getAgent,
    updateSessionModel,
    setCurrentSessionId,
    setSessions,
    routeBase = '/assistant',
  } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.draftInput) || '';
  });
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeAssistantRef = useRef<{ sessionId: string; assistantMessageId: string } | null>(null);

  // 保存输入框内容到 localStorage（防抖）
  const saveInput = useCallback((value: string) => {
    setInputValue(value);
  }, []);

  // 发送消息
  const sendMessage = useCallback(async (
    messageContent: string,
    newChatOptions?: NewChatOptions,
    onNavigate?: (path: string) => void
  ) => {
    if (!messageContent.trim() || isLoading) return;

    let sessionId = currentSessionId;
    let currentCwd = currentSession?.cwd;
    let currentAgentId = currentSession?.agentId || 'default';
    let currentPermissionMode = currentSession?.permissionMode || 'default';
    
    // 如果没有当前会话，使用新对话页面的选项创建新会话
    if (!sessionId && newChatOptions) {
      const selectedAgent = getAgent(newChatOptions.agentId);
      const agentPermissionMode = selectedAgent?.permissionMode || 'default';
      const finalPermissionMode = newChatOptions.permissionMode !== 'default' 
        ? newChatOptions.permissionMode 
        : agentPermissionMode;
      
      const newSession: Session = {
        id: uuidv4(),
        title: messageContent.slice(0, 30) + (messageContent.length > 30 ? '...' : ''),
        model: selectedModel,
        agentId: newChatOptions.agentId,
        cwd: newChatOptions.cwd || undefined,
        permissionMode: finalPermissionMode,
        createdAt: new Date(),
        messages: []
      };
      
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
      sessionId = newSession.id;
      currentCwd = newSession.cwd;
      currentAgentId = newSession.agentId || 'default';
      currentPermissionMode = newSession.permissionMode || 'default';
      
      updateSessionModel(newSession.id, selectedModel);
      
      onNavigate?.(`${routeBase}/${newSession.id}`);
    }

    const tempUserMessageId = uuidv4();
    const tempAssistantMessageId = uuidv4();

    const userMessage: Message = {
      id: tempUserMessageId,
      role: 'user',
      content: messageContent,
      timestamp: new Date()
    };

    const assistantMessage: Message = {
      id: tempAssistantMessageId,
      role: 'assistant',
      content: '',
      model: selectedModel,
      timestamp: new Date(),
      isStreaming: true,
      contentBlocks: []
    };

    setSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        const newTitle = s.messages.length === 0 
          ? messageContent.slice(0, 30) + (messageContent.length > 30 ? '...' : '')
          : s.title;
        return {
          ...s,
          title: newTitle,
          messages: [...s.messages, userMessage, assistantMessage]
        };
      }
      return s;
    }));

    setInputValue('');
    localStorage.removeItem(STORAGE_KEYS.draftInput);
    setIsLoading(true);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    activeAssistantRef.current = {
      sessionId: sessionId!,
      assistantMessageId: tempAssistantMessageId,
    };

    const agent = getAgent(currentAgentId);
    const systemPrompt = agent?.systemPrompt;
    let activeSessionIdForRequest = sessionId!;
    let activeAssistantMessageIdForRequest = tempAssistantMessageId;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          sessionId,
          message: messageContent,
          model: selectedModel,
          systemPrompt,
          cwd: currentCwd,
          permissionMode: currentPermissionMode,
        })
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let usedModel = selectedModel;
      let currentToolCalls: ToolCall[] = [];
      let contentBlocks: ContentBlock[] = [];
      let currentTextBlock: string = '';  // 当前正在积累的文本块
      let thinkingContent: string = '';
      let realSessionId: string = sessionId!;
      let realAssistantMessageId = tempAssistantMessageId;

      if (!response.ok) {
        throw new Error(`请求失败：${response.status}`);
      }

      if (!reader) {
        throw new Error('响应流不可用');
      }

      const updateAssistantMessage = (updates: Partial<Message>) => {
        setSessions(prev => prev.map(s => {
          if (s.id === realSessionId) {
            return {
              ...s,
              messages: s.messages.map(m =>
                m.id === realAssistantMessageId ? { ...m, ...updates } : m
              )
            };
          }
          return s;
        }));
      };

      const updateSessionMetadata = (data: any) => {
        setSessions(prev => prev.map(s => {
          if (s.id === realSessionId) {
            return {
              ...s,
              availableSkills: data.skills || s.availableSkills,
              mcpServers: data.mcpServers || s.mcpServers,
            };
          }
          return s;
        }));
      };

      const handleStreamData = (data: any) => {
        if (data.type === 'init') {
          realSessionId = data.sessionId;
          realAssistantMessageId = data.assistantMessageId;
          usedModel = data.model;
          
          if (realSessionId !== sessionId) {
            setSessions(prev => prev.map(s => 
              s.id === sessionId ? { ...s, id: realSessionId } : s
            ));
            setCurrentSessionId(realSessionId);
            sessionId = realSessionId;
          }
          activeAssistantRef.current = {
            sessionId: realSessionId,
            assistantMessageId: realAssistantMessageId,
          };
          activeSessionIdForRequest = realSessionId;
          activeAssistantMessageIdForRequest = realAssistantMessageId;
          
          setSessions(prev => prev.map(s => {
            if (s.id === realSessionId) {
              return {
                ...s,
                availableSkills: data.skills || s.availableSkills,
                mcpServers: data.mcpServers || s.mcpServers,
                messages: s.messages.map(m => 
                  m.id === tempAssistantMessageId 
                    ? { ...m, id: realAssistantMessageId }
                    : m
                )
              };
            }
            return s;
          }));
        } else if (data.type === 'metadata') {
          updateSessionMetadata(data);
        } else if (data.type === 'text') {
          fullContent += data.content;
          currentTextBlock += data.content;
          
          // 更新或创建最后一个文本块
          const lastBlock = contentBlocks[contentBlocks.length - 1];
          if (lastBlock && lastBlock.type === 'text') {
            lastBlock.text = currentTextBlock;
          } else if (currentTextBlock) {
            contentBlocks.push({ type: 'text', text: currentTextBlock });
          }
          
          updateAssistantMessage({
            content: fullContent,
            model: usedModel,
            toolCalls: [...currentToolCalls],
            contentBlocks: [...contentBlocks]
          });
        } else if (data.type === 'thinking') {
          thinkingContent += data.content || '';
          updateAssistantMessage({
            thinking: thinkingContent
          });
        } else if (data.type === 'tool') {
          // 如果有累积的文本，先结束当前文本块
          currentTextBlock = '';
          
          const toolCall: ToolCall = {
            id: data.id || uuidv4(),
            name: data.name,
            input: data.input,
            status: 'running'
          };
          currentToolCalls.push(toolCall);
          
          // 添加工具调用块
          contentBlocks.push({ type: 'tool_use', toolCall });
          
          updateAssistantMessage({
            toolCalls: [...currentToolCalls],
            contentBlocks: [...contentBlocks]
          });
        } else if (data.type === 'tool_result') {
          const toolId = data.toolId;
          const toolIndex = toolId 
            ? currentToolCalls.findIndex(t => t.id === toolId)
            : currentToolCalls.length - 1;
          
          if (toolIndex >= 0) {
            currentToolCalls[toolIndex].status = data.isError ? 'error' : 'completed';
            currentToolCalls[toolIndex].isError = data.isError || false;
            currentToolCalls[toolIndex].result = typeof data.content === 'string' 
              ? data.content 
              : JSON.stringify(data.content);
            
            // 同步更新 contentBlocks 中对应的工具调用
            const blockIndex = contentBlocks.findIndex(
              b => b.type === 'tool_use' && b.toolCall.id === currentToolCalls[toolIndex].id
            );
            if (blockIndex >= 0) {
              (contentBlocks[blockIndex] as { type: 'tool_use'; toolCall: ToolCall }).toolCall = { ...currentToolCalls[toolIndex] };
            }
            
            updateAssistantMessage({
              toolCalls: [...currentToolCalls],
              contentBlocks: [...contentBlocks]
            });
          }
        } else if (data.type === 'done') {
          updateAssistantMessage({ isStreaming: false });
        } else if (data.type === 'error') {
          const errorMessage = data.message || '发生错误，请重试';
          fullContent = errorMessage;
          contentBlocks = [{ type: 'text', text: errorMessage }];
          updateAssistantMessage({
            content: errorMessage,
            isStreaming: false,
            contentBlocks: [...contentBlocks]
          });
          setIsLoading(false);
        } else if (data.type === 'permission_request') {
          console.log('[Permission] Request received:', data);
          setPermissionRequest({
            requestId: data.requestId,
            toolUseId: data.toolUseId,
            toolName: data.toolName,
            input: data.input,
            sessionId: data.sessionId,
            timestamp: data.timestamp
          });
        }
      };

      const parseSseEvent = (eventText: string) => {
        const payload = eventText
          .split('\n')
          .filter(line => line.startsWith('data: '))
          .map(line => line.slice(6))
          .join('\n');

        if (!payload) return;

        try {
          handleStreamData(JSON.parse(payload));
        } catch (error) {
          console.warn('[SSE] Failed to parse event:', payload, error);
        }
      };

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        events.forEach(parseSseEvent);
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        parseSseEvent(buffer);
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        setSessions(prev => prev.map(s => {
          if (s.id === activeSessionIdForRequest) {
            return {
              ...s,
              messages: s.messages.map(m =>
                m.id === activeAssistantMessageIdForRequest
                  ? { ...m, isStreaming: false }
                  : m
              )
            };
          }
          return s;
        }));
        setPermissionRequest(null);
        return;
      }

      console.error('Chat error:', error);
      setSessions(prev => prev.map(s => {
        if (s.id === sessionId) {
          return {
            ...s,
            messages: s.messages.map(m => 
              m.id === tempAssistantMessageId 
                ? { ...m, content: '发生错误，请重试', isStreaming: false }
                : m
            )
          };
        }
        return s;
      }));
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
        activeAssistantRef.current = null;
      }
      setIsLoading(false);
    }
  }, [currentSession, currentSessionId, selectedModel, getAgent, updateSessionModel, setCurrentSessionId, setSessions, isLoading, routeBase]);

  // 处理停止事件
  const handleStop = useCallback(() => {
    console.log('ChatSender stop event');
    abortControllerRef.current?.abort();
    const activeAssistant = activeAssistantRef.current;
    if (activeAssistant) {
      setSessions(prev => prev.map(s => {
        if (s.id === activeAssistant.sessionId) {
          return {
            ...s,
            messages: s.messages.map(m =>
              m.id === activeAssistant.assistantMessageId
                ? { ...m, isStreaming: false }
                : m
            )
          };
        }
        return s;
      }));
    }
    setPermissionRequest(null);
    setIsLoading(false);
  }, [setSessions]);

  // 处理权限允许
  const handlePermissionAllow = useCallback(async () => {
    if (!permissionRequest) return;
    
    console.log('[Permission] User allowed:', permissionRequest.requestId);
    
    await fetch('/api/permission-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: permissionRequest.requestId,
        behavior: 'allow'
      })
    });
    
    setPermissionRequest(null);
  }, [permissionRequest]);

  // 处理权限拒绝
  const handlePermissionDeny = useCallback(async () => {
    if (!permissionRequest) return;
    
    console.log('[Permission] User denied:', permissionRequest.requestId);
    
    await fetch('/api/permission-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: permissionRequest.requestId,
        behavior: 'deny',
        message: '用户拒绝了此操作'
      })
    });
    
    setPermissionRequest(null);
  }, [permissionRequest]);

  return {
    isLoading,
    inputValue,
    setInputValue: saveInput,
    permissionRequest,
    sendMessage,
    handleStop,
    handlePermissionAllow,
    handlePermissionDeny,
  };
}
