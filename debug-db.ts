import pool from './src/db/pool';

async function debug() {
    try {
        const doctors = await pool.query('SELECT d.*, dep.name as department_name FROM doctors d LEFT JOIN departments dep ON d.department_id = dep.id');
        console.log('Doctors:', JSON.stringify(doctors.rows, null, 2));

        const departments = await pool.query('SELECT * FROM departments');
        console.log('Departments:', JSON.stringify(departments.rows, null, 2));

        const appointments = await pool.query('SELECT * FROM appointments');
        console.log('Appointments Count:', appointments.rowCount);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

debug();
