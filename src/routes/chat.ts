import { Router } from 'express';
import { runAgent } from '../agent';

const router = Router();

router.post('/', async (req, res) => {
    try {
        const user = req.user;
        const { message, history } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const response = await runAgent(user, message, history || []);

        res.json({ response });
    } catch (error: any) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Error processing your request', details: error.message });
    }
});

export default router;
