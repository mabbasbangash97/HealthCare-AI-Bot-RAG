import pool from '../db/pool';

export class ReportService {
    static async createReport(
        patientId: number,
        doctorId: number,
        fileName: string,
        filePath: string,
        reportType: string,
        description: string
    ) {
        const res = await pool.query(`
            INSERT INTO medical_reports 
            (patient_id, doctor_id, file_name, file_path, report_type, description)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, file_name, created_at
        `, [patientId, doctorId, fileName, filePath, reportType, description]);
        return res.rows[0];
    }

    static async getReportsByPatient(patientId: number) {
        const res = await pool.query(`
            SELECT r.*, d.name as doctor_name 
            FROM medical_reports r
            JOIN doctors d ON r.doctor_id = d.id
            WHERE r.patient_id = $1
            ORDER BY r.created_at DESC
        `, [patientId]);
        return res.rows;
    }

    static async updateReportDescription(reportId: number, description: string) {
        const res = await pool.query(`
            UPDATE medical_reports 
            SET description = $2
            WHERE id = $1
            RETURNING id, description
        `, [reportId, description]);
        return res.rows[0];
    }
}
