import pool from '../db/pool';

export class AuditService {
    /**
     * Log a user action to the database.
     * @param userId ID of the user performing the action (null for system/anonymous)
     * @param action Description of the action (e.g., 'LOGIN', 'APPOINTMENT_CREATED')
     * @param details Additional JSON metadata about the action
     */
    static async log(userId: number | null, action: string, details?: any) {
        try {
            const query = `
                INSERT INTO audit_logs (user_id, action, details)
                VALUES ($1, $2, $3)
            `;
            await pool.query(query, [userId, action, JSON.stringify(details || {})]);
        } catch (error) {
            // Log to console if audit logging fails, but don't crash the request
            console.error('Audit Log Failure:', error);
        }
    }
}
