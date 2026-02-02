import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { AppointmentService } from '../services/AppointmentService';

const router = Router();

router.get('/my', authenticateToken, async (req: any, res: any) => {
    const user = req.user;
    try {
        let appointments;
        if (user.role === 'patient') {
            appointments = await AppointmentService.getAppointmentsByPatient(user.patientId);
        } else if (user.role === 'doctor') {
            appointments = await AppointmentService.getAppointmentsByDoctor(user.doctorId);
        } else if (user.role === 'admin') {
            appointments = await AppointmentService.getAllAppointments();
        }
        res.json(appointments);
    } catch (err) {
        console.error('Error fetching appointments:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
