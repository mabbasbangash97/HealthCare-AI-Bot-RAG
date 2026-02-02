import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import authRoutes from './routes/auth';
import chatRoutes from './routes/chat';
import { authenticateToken } from './middleware/auth';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/test-ui', express.static(path.join(__dirname, '../test-ui')));

const PORT = process.env.PORT || 3000;

// Public routes
app.use('/auth', authRoutes);

// Protected routes
app.use('/chat', authenticateToken, chatRoutes);

import { Client } from 'pg';
const dbClient = new Client({ connectionString: process.env.DATABASE_URL });
dbClient.connect().catch(err => console.error('Dashboard DB connect error', err));

app.get('/appointments/my', authenticateToken, async (req: any, res: any) => {
    const user = req.user;
    try {
        let query = '';
        let params: any[] = [];
        if (user.role === 'patient') {
            query = `
                SELECT a.*, d.name as doctor_name 
                FROM appointments a 
                JOIN doctors d ON a.doctor_id = d.id 
                WHERE a.patient_id = $1 AND a.status != 'cancelled'
                ORDER BY a.scheduled_date, a.slot_start
            `;
            params = [user.patientId];
        } else if (user.role === 'admin') {
            query = `
                SELECT a.*, p.first_name, p.last_name, d.name as doctor_name 
                FROM appointments a 
                JOIN patients p ON a.patient_id = p.id
                JOIN doctors d ON a.doctor_id = d.id
                ORDER BY a.scheduled_date, a.slot_start
            `;
        } else {
            return res.json([]);
        }
        const result = await dbClient.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch appointments' });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
