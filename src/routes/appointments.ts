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

router.post('/create', authenticateToken, async (req: any, res: any) => {
    try {
        const user = req.user;
        const { date, slotStart, doctorId, patientId } = req.body;

        let targetPatientId = user.patientId;

        // Admin can book for anyone
        if (user.role === 'admin') {
            if (!patientId) return res.status(400).json({ error: 'Patient ID is required for admin booking' });
            targetPatientId = patientId;
        } else if (user.role === 'patient') {
            // Patient booking for self
            targetPatientId = user.patientId;
        } else {
            return res.status(403).json({ error: 'Doctors cannot book appointments via this API yet.' });
        }

        const code = await AppointmentService.createAppointment(targetPatientId, doctorId, date, slotStart);
        res.json({ success: true, confirmationCode: code });
    } catch (err: any) {
        console.error('Booking error:', err);
        if (err.message === 'Slot already booked.') {
            return res.status(400).json({ error: 'Slot already booked' });
        }
        res.status(500).json({ error: 'Booking failed', details: err.message });
    }
});

export default router;
