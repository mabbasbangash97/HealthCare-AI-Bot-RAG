import { Client } from 'pg';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import dotenv from 'dotenv';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { OpenAIEmbeddings } from '@langchain/openai';

dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().catch(err => console.error('Tools DB connect error', err));

// Factory function to get tools scoped to the user
export const getToolsForUser = (user: any) => {
    const tools = [];

    // 1. search_knowledge (Available to all)
    tools.push(tool(
        async ({ query }) => {
            try {
                const embeddings = new OpenAIEmbeddings();
                const vectorStore = await Chroma.fromExistingCollection(embeddings, {
                    collectionName: 'hospital_knowledge',
                    url: process.env.CHROMA_URL,
                });
                const results = await vectorStore.similaritySearch(query, 2);
                if (results.length === 0) return "No information found in the knowledge base.";
                return results.map(doc => doc.pageContent).join('\n---\n');
            } catch (err) {
                console.error('RAG Search Error:', err);
                return "Error searching the knowledge base.";
            }
        },
        {
            name: 'search_knowledge',
            description: 'Searches hospital knowledge base for general info (doctors, departments, schedule windows).',
            schema: z.object({ query: z.string() }),
        }
    ));

    // 2. get_doctors (Available to all)
    tools.push(tool(
        async ({ department }) => {
            let query = `SELECT d.id, d.name, dep.name as department FROM doctors d JOIN departments dep ON d.department_id = dep.id`;
            const params: any[] = [];
            if (department) {
                query += ` WHERE dep.name ILIKE $1`;
                params.push(`%${department}%`);
            }
            const res = await client.query(query, params);
            return JSON.stringify(res.rows);
        },
        {
            name: 'get_doctors',
            description: 'List doctors, optionally filtered by department. Patients can ONLY see doctor names and departments.',
            schema: z.object({ department: z.string().optional() }),
        }
    ));

    // NEW: get_departments (Available to all)
    tools.push(tool(
        async () => {
            const res = await client.query('SELECT name FROM departments ORDER BY name');
            return JSON.stringify(res.rows.map(r => r.name));
        },
        {
            name: 'get_departments',
            description: 'List all available hospital departments.',
            schema: z.object({})
        }
    ));

    // NEW: get_my_profile (Available to all)
    tools.push(tool(
        async () => {
            let query = '';
            let params = [user.userId];
            if (user.role === 'patient') {
                query = 'SELECT first_name, last_name, email FROM patients p JOIN users u ON u.patient_id = p.id WHERE u.id = $1';
            } else if (user.role === 'doctor') {
                query = 'SELECT name, email FROM doctors d JOIN users u ON u.doctor_id = d.id WHERE u.id = $1';
            } else {
                return JSON.stringify({ name: 'Administrator', role: 'admin' });
            }
            const res = await client.query(query, params);
            return JSON.stringify(res.rows[0]);
        },
        {
            name: 'get_my_profile',
            description: 'Get your own profile details (name, etc.). Use this to find out who you are talking to/who you are.',
            schema: z.object({})
        }
    ));

    // 3. get_doctor_schedule (Available to all)
    tools.push(tool(
        async ({ doctor_id }) => {
            const res = await client.query(`SELECT day_of_week, start_time, end_time FROM schedules WHERE doctor_id = $1`, [doctor_id]);
            return JSON.stringify(res.rows);
        },
        {
            name: 'get_doctor_schedule',
            description: 'Get generic OPD schedule for a doctor.',
            schema: z.object({ doctor_id: z.number() }),
        }
    ));

    // 4. get_available_slots (Patient & Admin)
    if (user.role === 'patient' || user.role === 'admin') {
        tools.push(tool(
            async ({ doctor_id, date }) => {
                // ... (Logic same as before) ...
                // Re-implementing brevity for context
                const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
                const schedRes = await client.query(`SELECT start_time, end_time FROM schedules WHERE doctor_id = $1 AND day_of_week = $2`, [doctor_id, dayName]);
                if (schedRes.rows.length === 0) return "Doctor not working on this day.";

                const { start_time, end_time } = schedRes.rows[0];
                const apptRes = await client.query(`SELECT slot_start FROM appointments WHERE doctor_id = $1 AND scheduled_date = $2 AND status != 'cancelled'`, [doctor_id, date]);
                const booked = new Set(apptRes.rows.map(r => r.slot_start));

                const slots = [];
                let current = new Date(`2000-01-01T${start_time}`);
                const end = new Date(`2000-01-01T${end_time}`);
                while (current < end) {
                    const time = current.toTimeString().split(' ')[0];
                    if (!booked.has(time)) slots.push(time);
                    current.setMinutes(current.getMinutes() + 30);
                }
                return JSON.stringify(slots);
            },
            {
                name: 'get_available_slots',
                description: 'Get available time slots.',
                schema: z.object({ doctor_id: z.number(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
            }
        ));
    }

    // 5. create_appointment
    // Patient: No patient_id in schema (injected). Admin: patient_id required.
    if (user.role === 'patient') {
        tools.push(tool(
            async ({ doctor_id, doctor_name_confirmation, date, slot_start }) => {
                const patient_id = user.patientId; // Injected
                try {
                    // Safety check: verify doctor_id matches doctor_name_confirmation
                    const docCheck = await client.query('SELECT name FROM doctors WHERE id = $1', [doctor_id]);
                    if (docCheck.rows.length === 0) return `Error: Doctor ID ${doctor_id} does not exist.`;

                    const actualName = docCheck.rows[0].name;
                    if (!actualName.toLowerCase().includes(doctor_name_confirmation.toLowerCase())) {
                        return `ERROR: Doctor ID ${doctor_id} belongs to ${actualName}, but you provided ${doctor_name_confirmation}. Please verify the ID using get_doctors and try again.`;
                    }

                    const code = `CONF-${Date.now()}`;
                    const start = new Date(`2000-01-01T${slot_start}`);
                    start.setMinutes(start.getMinutes() + 30);
                    const slot_end = start.toTimeString().split(' ')[0];

                    await client.query(`
                        INSERT INTO appointments (patient_id, doctor_id, scheduled_date, slot_start, slot_end, confirmation_code)
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `, [patient_id, doctor_id, date, slot_start, slot_end, code]);

                    return `Successfully booked with ${actualName}! Confirmation Code: ${code}`;
                } catch (e: any) {
                    if (e.code === '23505') return "Slot already booked.";
                    return "Error booking.";
                }
            },
            {
                name: 'create_appointment',
                description: 'Book an appointment for yourself. Always provide the doctor_name_confirmation to ensure accuracy.',
                schema: z.object({
                    doctor_id: z.number(),
                    doctor_name_confirmation: z.string().describe('The name of the doctor (e.g., "Dr. Emily Brown")'),
                    date: z.string(),
                    slot_start: z.string()
                }),
            }
        ));
    } else if (user.role === 'admin') {
        tools.push(tool(
            async ({ patient_id, doctor_id, doctor_name_confirmation, date, slot_start }) => {
                try {
                    const docCheck = await client.query('SELECT name FROM doctors WHERE id = $1', [doctor_id]);
                    if (docCheck.rows.length === 0) return `Error: Doctor ID ${doctor_id} does not exist.`;

                    const actualName = docCheck.rows[0].name;
                    if (!actualName.toLowerCase().includes(doctor_name_confirmation.toLowerCase())) {
                        return `ERROR: Doctor ID ${doctor_id} belongs to ${actualName}, but you provided ${doctor_name_confirmation}.`;
                    }

                    const code = `CONF-${Date.now()}`;
                    const start = new Date(`2000-01-01T${slot_start}`);
                    start.setMinutes(start.getMinutes() + 30);
                    const slot_end = start.toTimeString().split(' ')[0];
                    await client.query(`
                        INSERT INTO appointments (patient_id, doctor_id, scheduled_date, slot_start, slot_end, confirmation_code)
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `, [patient_id, doctor_id, date, slot_start, slot_end, code]);

                    return `Admin: Booked ${actualName} for patient ID ${patient_id}. Code: ${code}`;
                } catch (e: any) { return "Error booking."; }
            },
            {
                name: 'create_appointment',
                description: 'Book an appointment for a patient. Always provide the doctor_name_confirmation.',
                schema: z.object({
                    patient_id: z.number(),
                    doctor_id: z.number(),
                    doctor_name_confirmation: z.string().describe('The name of the doctor'),
                    date: z.string(),
                    slot_start: z.string()
                }),
            }
        ));
    }

    // 6. update_appointment
    if (user.role === 'patient' || user.role === 'admin') {
        tools.push(tool(
            async ({ confirmation_code, date, slot_start }) => {
                // Verify ownership for patient
                if (user.role === 'patient') {
                    const check = await client.query('SELECT 1 FROM appointments WHERE confirmation_code = $1 AND patient_id = $2', [confirmation_code, user.patientId]);
                    if (check.rows.length === 0) return "Appointment not found or not yours.";
                }

                try {
                    const start = new Date(`2000-01-01T${slot_start}`);
                    start.setMinutes(start.getMinutes() + 30);
                    const slot_end = start.toTimeString().split(' ')[0];

                    await client.query(`
                        UPDATE appointments 
                        SET scheduled_date = $1, slot_start = $2, slot_end = $3, updated_at = CURRENT_TIMESTAMP
                        WHERE confirmation_code = $4
                    `, [date, slot_start, slot_end, confirmation_code]);
                    return `Appointment updated to ${date} at ${slot_start}.`;
                } catch (e: any) {
                    if (e.code === '23505') return "The new slot is already booked.";
                    return "Error updating appointment.";
                }
            },
            {
                name: 'update_appointment',
                description: 'Change the date or time of an existing appointment.',
                schema: z.object({ confirmation_code: z.string(), date: z.string(), slot_start: z.string() }),
            }
        ));
    }

    // 7. cancel_appointment
    if (user.role === 'patient' || user.role === 'admin') {
        tools.push(tool(
            async ({ confirmation_code }) => {
                if (user.role === 'patient') {
                    const check = await client.query('SELECT 1 FROM appointments WHERE confirmation_code = $1 AND patient_id = $2', [confirmation_code, user.patientId]);
                    if (check.rows.length === 0) return "Appointment not found or not yours.";
                }

                await client.query("UPDATE appointments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE confirmation_code = $1", [confirmation_code]);
                return "Appointment cancelled successfully.";
            },
            {
                name: 'cancel_appointment',
                description: 'Cancel an existing appointment using the confirmation code.',
                schema: z.object({ confirmation_code: z.string() }),
            }
        ));
    }

    // 8. list_my_appointments
    if (user.role === 'patient') {
        tools.push(tool(
            async () => {
                const res = await client.query(`
                    SELECT a.*, d.name as doctor_name 
                    FROM appointments a 
                    JOIN doctors d ON a.doctor_id = d.id 
                    WHERE a.patient_id = $1 AND a.status != 'cancelled'
                    ORDER BY a.scheduled_date, a.slot_start
                `, [user.patientId]);
                return JSON.stringify(res.rows);
            },
            {
                name: 'list_my_appointments',
                description: 'List your current scheduled appointments.',
                schema: z.object({}),
            }
        ));
    }

    // Admin Tools
    if (user.role === 'admin') {
        tools.push(tool(
            async () => {
                const res = await client.query(`
                    SELECT a.*, p.first_name, p.last_name, d.name as doctor_name 
                    FROM appointments a 
                    JOIN patients p ON a.patient_id = p.id
                    JOIN doctors d ON a.doctor_id = d.id
                    ORDER BY a.scheduled_date, a.slot_start
                `);
                return JSON.stringify(res.rows);
            },
            {
                name: 'list_all_appointments',
                description: 'List all appointments (scheduled, cancelled, etc.) in the hospital with patient and doctor names.',
                schema: z.object({})
            }
        ));

        tools.push(tool(
            async ({ patient_id }) => {
                const res = await client.query(`
                    SELECT a.*, p.first_name, p.last_name, d.name as doctor_name 
                    FROM appointments a 
                    JOIN patients p ON a.patient_id = p.id
                    JOIN doctors d ON a.doctor_id = d.id
                    WHERE a.patient_id = $1
                    ORDER BY a.scheduled_date, a.slot_start
                `, [patient_id]);
                return JSON.stringify(res.rows);
            },
            {
                name: 'list_patient_appointments',
                description: 'List all appointments (including cancelled) for a specific patient ID.',
                schema: z.object({ patient_id: z.number() })
            }
        ));

        tools.push(tool(
            async () => {
                const doctors = await client.query('SELECT COUNT(*) FROM doctors');
                const patients = await client.query('SELECT COUNT(*) FROM patients');
                const totalAppts = await client.query('SELECT COUNT(*) FROM appointments');
                const activeAppts = await client.query('SELECT COUNT(*) FROM appointments WHERE status = \'scheduled\'');
                return `Hospital Stats: ${doctors.rows[0].count} Doctors, ${patients.rows[0].count} Patients. Appointments: ${totalAppts.rows[0].count} Total (${activeAppts.rows[0].count} Scheduled).`;
            },
            {
                name: 'get_hospital_overview',
                description: 'Get high-level hospital statistics including appointment breakdown.',
                schema: z.object({})
            }
        ));

        tools.push(tool(
            async ({ phone }) => {
                const res = await client.query('SELECT * FROM patients WHERE phone = $1', [phone]);
                return JSON.stringify(res.rows);
            },
            {
                name: 'get_patient_by_phone',
                description: 'Lookup patient details by phone number.',
                schema: z.object({ phone: z.string() })
            }
        ));

        tools.push(tool(
            async ({ patient_id }) => {
                const res = await client.query('SELECT * FROM patients WHERE id = $1', [patient_id]);
                return JSON.stringify(res.rows);
            },
            {
                name: 'get_patient_details',
                description: 'Get full details of a patient using their ID.',
                schema: z.object({ patient_id: z.number() })
            }
        ));
    }

    // Doctor specific tools
    if (user.role === 'doctor') {
        tools.push(tool(
            async () => {
                const res = await client.query(`
                SELECT a.*, p.first_name, p.last_name 
                FROM appointments a
                JOIN patients p ON a.patient_id = p.id
                WHERE a.doctor_id = $1 AND a.status = 'scheduled'
                ORDER BY a.scheduled_date, a.slot_start
              `, [user.doctorId]);
                return JSON.stringify(res.rows);
            },
            {
                name: 'list_my_schedule_details',
                description: 'List my scheduled appointments with patient details.',
                schema: z.object({})
            }
        ));

        tools.push(tool(
            async ({ patient_id }) => {
                const check = await client.query('SELECT 1 FROM appointments WHERE doctor_id = $1 AND patient_id = $2', [user.doctorId, patient_id]);
                if (check.rows.length === 0) return "This patient is not assigned to you or has no appointments with you.";

                const res = await client.query('SELECT * FROM patients WHERE id = $1', [patient_id]);
                return JSON.stringify(res.rows);
            },
            {
                name: 'get_my_patient_details',
                description: 'Get details of a patient who has an appointment with you.',
                schema: z.object({ patient_id: z.number() })
            }
        ));
    }

    return tools;
};
