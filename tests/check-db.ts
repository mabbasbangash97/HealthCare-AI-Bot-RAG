import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function checkDb() {
    try {
        await client.connect();
        console.log('--- Checking Appointments ---');
        const res = await client.query('SELECT * FROM appointments');
        console.table(res.rows);

        const count = await client.query('SELECT COUNT(*) FROM appointments');
        console.log(`Total appointments: ${count.rows[0].count}`);

        if (res.rows.length > 0) {
            console.log('Sample Row:', JSON.stringify(res.rows[0], null, 2));
        }
    } catch (err) {
        console.error('Check failed:', err);
    } finally {
        await client.end();
    }
}

checkDb();
