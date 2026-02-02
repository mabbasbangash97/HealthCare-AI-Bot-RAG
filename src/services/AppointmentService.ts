import pool from '../db/pool';

export class AppointmentService {
    static async getAppointmentsByPatient(patientId: number) {
        const res = await pool.query(`
            SELECT a.*, d.name as doctor_name 
            FROM appointments a 
            JOIN doctors d ON a.doctor_id = d.id 
            WHERE a.patient_id = $1 AND a.status != 'cancelled'
            ORDER BY a.scheduled_date, a.slot_start
        `, [patientId]);
        return res.rows;
    }

    static async getAllAppointments() {
        const res = await pool.query(`
            SELECT a.*, p.first_name, p.last_name, d.name as doctor_name 
            FROM appointments a 
            JOIN patients p ON a.patient_id = p.id
            JOIN doctors d ON a.doctor_id = d.id
            ORDER BY a.scheduled_date, a.slot_start
        `);
        return res.rows;
    }

    static async getAppointmentsByDoctor(doctorId: number) {
        const res = await pool.query(`
            SELECT a.*, p.first_name, p.last_name 
            FROM appointments a
            JOIN patients p ON a.patient_id = p.id
            WHERE a.doctor_id = $1 AND a.status = 'scheduled'
            ORDER BY a.scheduled_date, a.slot_start
        `, [doctorId]);
        return res.rows;
    }

    static async getAvailableSlots(doctorId: number, date: string) {
        const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
        const schedRes = await pool.query(
            'SELECT start_time, end_time FROM schedules WHERE doctor_id = $1 AND day_of_week = $2',
            [doctorId, dayName]
        );

        if (schedRes.rows.length === 0) return [];

        const { start_time, end_time } = schedRes.rows[0];
        const apptRes = await pool.query(
            "SELECT slot_start FROM appointments WHERE doctor_id = $1 AND scheduled_date = $2 AND status != 'cancelled'",
            [doctorId, date]
        );
        const booked = new Set(apptRes.rows.map(r => r.slot_start));

        const slots = [];
        let current = new Date(`2000-01-01T${start_time}`);
        const end = new Date(`2000-01-01T${end_time}`);

        while (current < end) {
            const time = current.toTimeString().split(' ')[0];
            if (!booked.has(time)) slots.push(time);
            current.setMinutes(current.getMinutes() + 30);
        }
        return slots;
    }

    static async createAppointment(patientId: number, doctorId: number, date: string, slotStart: string) {
        const code = `CONF-${Date.now()}`;
        const start = new Date(`2000-01-01T${slotStart}`);
        start.setMinutes(start.getMinutes() + 30);
        const slotEnd = start.toTimeString().split(' ')[0];

        const res = await pool.query(`
            INSERT INTO appointments (patient_id, doctor_id, scheduled_date, slot_start, slot_end, confirmation_code)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING confirmation_code
        `, [patientId, doctorId, date, slotStart, slotEnd, code]);

        return res.rows[0].confirmation_code;
    }

    static async cancelAppointment(confirmationCode: string, patientId?: number) {
        if (patientId) {
            const check = await pool.query(
                'SELECT 1 FROM appointments WHERE confirmation_code = $1 AND patient_id = $2',
                [confirmationCode, patientId]
            );
            if (check.rows.length === 0) throw new Error("Appointment not found or not yours.");
        }

        await pool.query(
            "UPDATE appointments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE confirmation_code = $1",
            [confirmationCode]
        );
        return true;
    }

    static async updateAppointment(confirmationCode: string, date: string, slotStart: string, patientId?: number) {
        if (patientId) {
            const check = await pool.query(
                'SELECT 1 FROM appointments WHERE confirmation_code = $1 AND patient_id = $2',
                [confirmationCode, patientId]
            );
            if (check.rows.length === 0) throw new Error("Appointment not found or not yours.");
        }

        const start = new Date(`2000-01-01T${slotStart}`);
        start.setMinutes(start.getMinutes() + 30);
        const slotEnd = start.toTimeString().split(' ')[0];

        await pool.query(`
            UPDATE appointments 
            SET scheduled_date = $1, slot_start = $2, slot_end = $3, updated_at = CURRENT_TIMESTAMP
            WHERE confirmation_code = $4
        `, [date, slotStart, slotEnd, confirmationCode]);
        return true;
    }

    static async verifyDoctorPatientRelationship(doctorId: number, patientId: number) {
        const check = await pool.query(
            'SELECT 1 FROM appointments WHERE doctor_id = $1 AND patient_id = $2',
            [doctorId, patientId]
        );
        return check.rows.length > 0;
    }
}
