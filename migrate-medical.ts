
import pool from './src/db/pool';

async function migrate() {
    try {
        console.log('Running medical-grade migrations...');

        // 1. Audit Logs Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                action TEXT NOT NULL,
                details JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Audit logs table created.');

        // 2. Add Status Change Logging support if needed
        // (Optional: triggers for automatic logging, but code-level is fine too)

        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
