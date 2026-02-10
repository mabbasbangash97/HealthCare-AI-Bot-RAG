import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import authRoutes from './routes/auth';
import chatRoutes from './routes/chat';
import appointmentRoutes from './routes/appointments';
import reportRoutes from './routes/reports';
import { authenticateToken } from './middleware/auth';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/test-ui', express.static(path.join(__dirname, '../test-ui')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

const PORT = process.env.PORT || 3000;

// Public routes
app.use('/auth', authRoutes);

// Protected routes
app.use('/chat', authenticateToken, chatRoutes);
app.use('/appointments', authenticateToken, appointmentRoutes);
app.use('/reports', authenticateToken, reportRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
