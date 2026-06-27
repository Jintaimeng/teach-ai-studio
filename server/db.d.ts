export interface DbSession {
    id: string;
    title: string;
    model: string;
    sdk_session_id: string | null;
    created_at: string;
    updated_at: string;
}
export interface DbMessage {
    id: string;
    session_id: string;
    role: 'user' | 'assistant';
    content: string;
    model: string | null;
    created_at: string;
    tool_calls: string | null;
}
export declare function getAllSessions(): Promise<DbSession[]>;
export declare function getSession(id: string): Promise<DbSession | undefined>;
export declare function createSession(session: DbSession): Promise<DbSession>;
export declare function updateSession(id: string, updates: Partial<Pick<DbSession, 'title' | 'model' | 'sdk_session_id'>>): Promise<boolean>;
export declare function deleteSession(id: string): Promise<boolean>;
export declare function getMessagesBySession(sessionId: string): Promise<DbMessage[]>;
export declare function createMessage(message: DbMessage): Promise<DbMessage>;
export declare function updateMessage(id: string, updates: Partial<Pick<DbMessage, 'content' | 'tool_calls'>>): Promise<boolean>;
export declare function deleteMessage(id: string): Promise<boolean>;
export declare function createMessages(messages: DbMessage[]): Promise<void>;
export declare function clearAllData(): Promise<void>;
declare const _default: {
    getAllSessions: typeof getAllSessions;
    getSession: typeof getSession;
    createSession: typeof createSession;
    updateSession: typeof updateSession;
    deleteSession: typeof deleteSession;
    getMessagesBySession: typeof getMessagesBySession;
    createMessage: typeof createMessage;
    updateMessage: typeof updateMessage;
    deleteMessage: typeof deleteMessage;
    createMessages: typeof createMessages;
    clearAllData: typeof clearAllData;
};
export default _default;
