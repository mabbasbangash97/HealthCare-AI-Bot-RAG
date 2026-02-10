import { Router } from 'express';
import { runAgent } from '../agent';
import { ChatService } from '../services/ChatService';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Get all sessions for the logged-in user
router.get('/sessions', authenticateToken, async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const sessions = await ChatService.getSessions(userId);
        res.json(sessions);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
});

// Get messages for a specific session
router.get('/sessions/:id', authenticateToken, async (req: any, res: any) => {
    try {
        const messages = await ChatService.getMessages(parseInt(req.params.id));
        res.json(messages);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Post a new message to a session (or start a new one)
router.post('/', authenticateToken, async (req: any, res: any) => {
    try {
        const user = req.user;
        let { message, history, sessionId } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // 1. Create session if it doesn't exist
        if (!sessionId) {
            const title = message.substring(0, 30) + (message.length > 30 ? '...' : '');
            const session = await ChatService.createSession(user.userId, title);
            sessionId = session.id;
        }

        // 2. Save user message
        await ChatService.saveMessage(sessionId, 'user', message);

        // 3. Run Agent
        const response = await runAgent(user, message, history || []);

        // 4. Save assistant response
        await ChatService.saveMessage(sessionId, 'assistant', response);

        res.json({ response, sessionId });
    } catch (error: any) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Error processing your request', details: error.message });
    }
});

export default router;
