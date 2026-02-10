import pool from '../db/pool';

export class HospitalService {
    static async getAllDepartments(): Promise<string[]> {
        const res = await pool.query('SELECT name FROM departments ORDER BY name');
        return res.rows.map(r => r.name);
    }

    static async getDoctors(department?: string) {
        let query = `
            SELECT d.id, d.name, dep.name as department 
            FROM doctors d 
            JOIN departments dep ON d.department_id = dep.id
        `;
        const params: any[] = [];
        if (department) {
            query += ` WHERE dep.name ILIKE $1`;
            params.push(`%${department}%`);
        }
        const res = await pool.query(query, params);
        return res.rows;
    }

    static async getDoctorSchedule(doctorId: number) {
        const res = await pool.query(
            `SELECT TO_CHAR(schedule_date, 'Day') as day_of_week, start_time, end_time 
             FROM schedules 
             WHERE doctor_id = $1 AND schedule_date >= CURRENT_DATE
             ORDER BY schedule_date`,
            [doctorId]
        );
        return res.rows;
    }

    static async getAllDoctorSchedules() {
        const res = await pool.query(`
            SELECT d.id, d.name as doctor_name, dep.name as department, 
                   TO_CHAR(s.schedule_date, 'Day') as day_of_week, 
                   s.start_time, s.end_time
            FROM schedules s
            JOIN doctors d ON s.doctor_id = d.id
            JOIN departments dep ON d.department_id = dep.id
            WHERE s.schedule_date >= CURRENT_DATE
            ORDER BY d.name, s.schedule_date
        `);

        // Group by doctor
        const schedules: any = {};
        res.rows.forEach(((row: any) => {
            if (!schedules[row.doctor_name]) {
                schedules[row.doctor_name] = {
                    doctor: row.doctor_name,
                    id: row.id,
                    department: row.department,
                    shifts: []
                };
            }
            schedules[row.doctor_name].shifts.push({
                day: row.day_of_week.trim(),
                start: row.start_time,
                end: row.end_time
            });
        }));

        return Object.values(schedules);
    }

    static async getDoctorById(doctorId: number) {
        const res = await pool.query('SELECT * FROM doctors WHERE id = $1', [doctorId]);
        return res.rows[0];
    }

    static async getHospitalOverview() {
        const doctors = await pool.query('SELECT COUNT(*) FROM doctors');
        const patients = await pool.query('SELECT COUNT(*) FROM patients');
        const totalAppts = await pool.query('SELECT COUNT(*) FROM appointments');
        const activeAppts = await pool.query("SELECT COUNT(*) FROM appointments WHERE status = 'scheduled'");

        return {
            doctors: parseInt(doctors.rows[0].count),
            patients: parseInt(patients.rows[0].count),
            appointments: {
                total: parseInt(totalAppts.rows[0].count),
                active: parseInt(activeAppts.rows[0].count)
            }
        };
    }
}
