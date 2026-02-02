import pool from '../db/pool';

export class UserService {
    static async getPatientProfile(userId: number) {
        const res = await pool.query(`
            SELECT p.*, u.email 
            FROM patients p 
            JOIN users u ON u.patient_id = p.id 
            WHERE u.id = $1
        `, [userId]);
        return res.rows[0];
    }

    static async getDoctorProfile(userId: number) {
        const res = await pool.query(`
            SELECT d.*, u.email 
            FROM doctors d 
            JOIN users u ON u.doctor_id = d.id 
            WHERE u.id = $1
        `, [userId]);
        return res.rows[0];
    }

    static async getPatientById(patientId: number) {
        const res = await pool.query('SELECT * FROM patients WHERE id = $1', [patientId]);
        return res.rows[0];
    }

    static async getPatientByPhone(phone: string) {
        const res = await pool.query('SELECT * FROM patients WHERE phone = $1', [phone]);
        return res.rows;
    }
}
