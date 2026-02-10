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

    static async getPatientByMRN(mrn: string) {
        const res = await pool.query('SELECT * FROM patients WHERE mrn = $1', [mrn]);
        return res.rows[0];
    }

    static async createPatient(data: {
        firstName: string;
        lastName: string;
        phone: string;
        dob?: string;
        gender?: string;
        address?: string;
        city?: string;
        email?: string;
        allergies?: string;
        chronicDiseases?: string;
        currentMedications?: string;
        healthNotes?: string;
    }) {
        // Generate unique MRN
        const mrn = `MRN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const res = await pool.query(`
            INSERT INTO patients (
                mrn, first_name, last_name, phone, dob, gender, address, city, email,
                allergies, chronic_diseases, current_medications, health_notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
        `, [
            mrn,
            data.firstName,
            data.lastName,
            data.phone,
            data.dob || null,
            data.gender || null,
            data.address || null,
            data.city || null,
            data.email || null,
            data.allergies || null,
            data.chronicDiseases || null,
            data.currentMedications || null,
            data.healthNotes || null
        ]);

        return res.rows[0];
    }

    static async updatePatientMedicalInfo(patientId: number, data: {
        allergies?: string;
        chronicDiseases?: string;
        currentMedications?: string;
        healthNotes?: string;
    }) {
        const res = await pool.query(`
            UPDATE patients 
            SET 
                allergies = COALESCE($2, allergies),
                chronic_diseases = COALESCE($3, chronic_diseases),
                current_medications = COALESCE($4, current_medications),
                health_notes = COALESCE($5, health_notes)
            WHERE id = $1
            RETURNING *
        `, [
            patientId,
            data.allergies,
            data.chronicDiseases,
            data.currentMedications,
            data.healthNotes
        ]);

        return res.rows[0];
    }

    static async verifyDoctorPatientRelationship(doctorId: number, patientId: number) {
        const check = await pool.query(
            'SELECT 1 FROM appointments WHERE doctor_id = $1 AND patient_id = $2',
            [doctorId, patientId]
        );
        return check.rows.length > 0;
    }
}
