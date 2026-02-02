import { Router } from 'express';
import pool from '../db/pool';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const tokenPayload = {
            userId: user.id,
            email: user.email,
            role: user.role,
            patientId: user.patient_id,
            doctorId: user.doctor_id
        };

        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '8h' });

        res.json({ token, user: tokenPayload });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
