import pool from './src/db/pool';

async function debug() {
    try {
        // Check the specific appointment
        const appt = await pool.query(
            "SELECT * FROM appointments WHERE confirmation_code = 'CONF-1770299896102'"
        );
        console.log('\n=== APPOINTMENT ===');
        console.log(JSON.stringify(appt.rows, null, 2));

        if (appt.rows.length > 0) {
            const patientId = appt.rows[0].patient_id;
            console.log(`\nLooking for patient_id: ${patientId}`);

            // Check if patient exists
            const patient = await pool.query(
                'SELECT * FROM patients WHERE id = $1',
                [patientId]
            );
            console.log('\n=== PATIENT WITH THIS ID ===');
            console.log(JSON.stringify(patient.rows, null, 2));
        }

        // Check if Haseem exists with the phone number
        const haseemByPhone = await pool.query(
            "SELECT * FROM patients WHERE phone = '090078601'"
        );
        console.log('\n=== PATIENT BY PHONE 090078601 ===');
        console.log(JSON.stringify(haseemByPhone.rows, null, 2));

        // Last 5 patients
        const recentPatients = await pool.query(
            'SELECT id, first_name, last_name, phone, mrn FROM patients ORDER BY id DESC LIMIT 5'
        );
        console.log('\n=== LAST 5 PATIENTS ===');
        console.log(JSON.stringify(recentPatients.rows, null, 2));

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
    }
}

debug();
