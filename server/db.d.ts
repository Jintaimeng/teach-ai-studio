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
export interface DbFavoriteCase {
    id: string;
    title: string;
    candidate_summary: string | null;
    query_json: string;
    result_json: string;
    note: string | null;
    created_at: string;
}
export interface DbPromoCopy {
    id: string;
    title: string;
    content: string;
    feed_ids: string | null;
    feed_snapshot: string | null;
    favorite: number;
    created_at: string;
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
export declare function getAllFavoriteCases(): Promise<DbFavoriteCase[]>;
export declare function getFavoriteCase(id: string): Promise<DbFavoriteCase | undefined>;
export declare function createFavoriteCase(item: DbFavoriteCase): Promise<DbFavoriteCase>;
export declare function deleteFavoriteCase(id: string): Promise<boolean>;
export declare function getAllPromoCopies(): Promise<DbPromoCopy[]>;
export declare function getPromoCopy(id: string): Promise<DbPromoCopy | undefined>;
export declare function createPromoCopy(item: DbPromoCopy): Promise<DbPromoCopy>;
export declare function setPromoCopyFavorite(id: string, favorite: boolean): Promise<boolean>;
export declare function deletePromoCopy(id: string): Promise<boolean>;
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
    getAllFavoriteCases: typeof getAllFavoriteCases;
    getFavoriteCase: typeof getFavoriteCase;
    createFavoriteCase: typeof createFavoriteCase;
    deleteFavoriteCase: typeof deleteFavoriteCase;
    getAllPromoCopies: typeof getAllPromoCopies;
    getPromoCopy: typeof getPromoCopy;
    createPromoCopy: typeof createPromoCopy;
    setPromoCopyFavorite: typeof setPromoCopyFavorite;
    deletePromoCopy: typeof deletePromoCopy;
};
export default _default;
