
import pool from './src/db/pool';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    try {
        const res = await pool.query('SELECT id, name, department_id FROM doctors ORDER BY id');
        console.log("Doctors:", res.rows);
    } catch (e) {
        console.error(e);
    }
}
run();
