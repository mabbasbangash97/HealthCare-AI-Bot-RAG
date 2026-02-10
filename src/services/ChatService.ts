import pool from '../db/pool';

export class ChatService {
    static async createSession(userId: number, title: string = 'New Chat') {
        const res = await pool.query(
            'INSERT INTO chat_sessions (user_id, title) VALUES ($1, $2) RETURNING *',
            [userId, title]
        );
        return res.rows[0];
    }

    static async getSessions(userId: number) {
        const res = await pool.query(
            'SELECT * FROM chat_sessions WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        return res.rows;
    }

    static async getMessages(sessionId: number) {
        const res = await pool.query(
            'SELECT role, content FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC',
            [sessionId]
        );
        return res.rows;
    }

    static async saveMessage(sessionId: number, role: string, content: string) {
        await pool.query(
            'INSERT INTO chat_messages (session_id, role, content) VALUES ($1, $2, $3)',
            [sessionId, role, content]
        );
    }

    static async updateSessionTitle(sessionId: number, title: string) {
        await pool.query(
            'UPDATE chat_sessions SET title = $1 WHERE id = $2',
            [title, sessionId]
        );
    }
}
