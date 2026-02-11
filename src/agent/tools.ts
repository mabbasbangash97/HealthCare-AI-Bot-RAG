import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import dotenv from 'dotenv';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { AppointmentService } from '../services/AppointmentService';
import { HospitalService } from '../services/HospitalService';
import { UserService } from '../services/UserService';
import { AuditService } from '../services/AuditService';
import { ReportService } from '../services/ReportService';

dotenv.config();

// Factory function to get tools scoped to the user
export const getToolsForUser = (user: any) => {
    const tools = [];

    // 1. search_knowledge (Available to all)
    tools.push(tool(
        async ({ query }) => {
            try {
                const embeddings = new GoogleGenerativeAIEmbeddings({
                    apiKey: process.env.GEMINI_API_KEY,
                    model: 'gemini-embedding-001',
                });
                const vectorStore = await Chroma.fromExistingCollection(embeddings, {
                    collectionName: 'hospital_knowledge_v2',
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
            const doctors = await HospitalService.getDoctors(department);
            return JSON.stringify(doctors);
        },
        {
            name: 'get_doctors',
            description: 'List doctors, optionally filtered by department. Patients can ONLY see doctor names and departments.',
            schema: z.object({ department: z.string().optional() }),
        }
    ));

    // 3. get_departments (Available to all)
    tools.push(tool(
        async () => {
            const departments = await HospitalService.getAllDepartments();
            return JSON.stringify(departments);
        },
        {
            name: 'get_departments',
            description: 'List all available hospital departments.',
            schema: z.object({})
        }
    ));

    // 4. get_my_profile (Available to all)
    tools.push(tool(
        async () => {
            if (user.role === 'patient') {
                const profile = await UserService.getPatientProfile(user.userId);
                return JSON.stringify(profile);
            } else if (user.role === 'doctor') {
                const profile = await UserService.getDoctorProfile(user.userId);
                return JSON.stringify(profile);
            } else {
                return JSON.stringify({ name: 'Administrator', role: 'admin' });
            }
        },
        {
            name: 'get_my_profile',
            description: 'Get your own profile details (name, MRN, etc.). Use this to find out who you are talking to/who you are.',
            schema: z.object({})
        }
    ));

    // 5. get_doctor_schedule (Available to all)
    tools.push(tool(
        async ({ doctor_id }) => {
            const schedule = await HospitalService.getDoctorSchedule(doctor_id);
            return JSON.stringify(schedule);
        },
        {
            name: 'get_doctor_schedule',
            description: 'Get the doctor\'s weekly schedule (which days they work and general hours). This does NOT show specific available slots. To book appointments, use get_available_slots with a specific date.',
            schema: z.object({ doctor_id: z.number() }),
        }
    ));

    // 5.5. list_all_doctor_schedules (Available to all)
    tools.push(tool(
        async () => {
            const schedules = await HospitalService.getAllDoctorSchedules();
            return JSON.stringify(schedules);
        },
        {
            name: 'list_all_doctor_schedules',
            description: 'Get weekly schedules (working days/hours) for ALL doctors in the hospital. Useful when a user asks for "all doc schedules" or "who is working when".',
            schema: z.object({})
        }
    ));

    // 6. get_available_slots (Patient & Admin)
    if (user.role === 'patient' || user.role === 'admin') {
        tools.push(tool(
            async ({ doctor_id, date }) => {
                const slots = await AppointmentService.getAvailableSlots(doctor_id, date);
                if (slots.length === 0) return "Doctor not working on this day or no slots available.";
                return JSON.stringify(slots);
            },
            {
                name: 'get_available_slots',
                description: 'Get specific available 30-minute time slots for a doctor on a given date (YYYY-MM-DD). Use this to show bookable times to patients.',
                schema: z.object({ doctor_id: z.number(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
            }
        ));
    }

    // 7. create_appointment
    if (user.role === 'patient') {
        tools.push(tool(
            async ({ doctor_id, doctor_name_confirmation, date, slot_start }) => {
                const doctor = await HospitalService.getDoctorById(doctor_id);
                if (!doctor) return `Error: Doctor ID ${doctor_id} does not exist.`;

                if (!doctor.name.toLowerCase().includes(doctor_name_confirmation.toLowerCase())) {
                    return `ERROR: Doctor ID ${doctor_id} belongs to ${doctor.name}, but you provided ${doctor_name_confirmation}. Please verify the ID using get_doctors and try again.`;
                }

                try {
                    const code = await AppointmentService.createAppointment(user.patientId, doctor_id, date, slot_start);
                    await AuditService.log(user.userId, 'CREATE_APPOINTMENT', { doctor_id, date, slot_start, code });
                    return `Successfully booked with ${doctor.name}! Confirmation Code: ${code}`;
                } catch (e: any) {
                    if (e.message === 'Slot already booked.') return "Slot already booked.";
                    return "Error booking.";
                }
            },
            {
                name: 'create_appointment',
                description: 'Book an appointment for yourself. Always provide the doctor_name_confirmation.',
                schema: z.object({
                    doctor_id: z.number(),
                    doctor_name_confirmation: z.string().describe('The name of the doctor'),
                    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                    slot_start: z.string()
                }),
            }
        ));

        // 7.5. get_patient_medical_profile (Patient Version - Self only)
        tools.push(tool(
            async ({ patient_id, mrn }) => {
                let resolvedPatientId = patient_id;

                // Resolve MRN to ID if ID is missing but MRN is provided
                if (!resolvedPatientId && mrn) {
                    const patientByMrn = await UserService.getPatientByMRN(mrn);
                    if (!patientByMrn) return `Error: No patient found with MRN ${mrn}`;
                    resolvedPatientId = patientByMrn.id;
                }

                // If no ID/MRN provided, default to self
                if (!resolvedPatientId) {
                    resolvedPatientId = user.patientId;
                }

                if (!resolvedPatientId) return "Error: Could not determine patient ID.";

                // STRICT CHECK: Patient can ONLY view their own profile
                if (resolvedPatientId !== user.patientId) {
                    return "ACCESS DENIED: You are only allowed to view your own medical profile.";
                }

                const patient = await UserService.getPatientById(resolvedPatientId);
                if (!patient) return `Error: Patient profile not found.`;

                // Fetch medical reports
                const reports = await ReportService.getReportsByPatient(resolvedPatientId);

                // Calculate age
                const birthDate = new Date(patient.dob);
                const ageDifMs = Date.now() - birthDate.getTime();
                const ageDate = new Date(ageDifMs);
                const age = Math.abs(ageDate.getUTCFullYear() - 1970);

                return JSON.stringify({
                    mrn: patient.mrn,
                    first_name: patient.first_name,
                    last_name: patient.last_name,
                    age: age,
                    dob: patient.dob,
                    gender: patient.gender,
                    blood_group: patient.blood_group,
                    medical_notes: patient.health_notes,
                    allergies: patient.allergies,
                    chronic_diseases: patient.chronic_diseases,
                    current_medications: patient.current_medications,
                    uploaded_reports: reports.map((r: any) => {
                        const filename = r.file_path.split('/').pop();
                        const baseUrl = process.env.PUBLIC_URL || process.env.API_URL || 'http://localhost:3000';
                        const url = `${baseUrl}/uploads/${filename}`;

                        // Parse description to separate user input and AI analysis
                        const parts = (r.description || '').split('--- AI ANALYSIS ---');
                        const userDescription = parts[0]?.trim() || '';
                        const aiAnalysis = parts[1]?.trim() || null;

                        return {
                            id: r.id,
                            file_name: r.file_name,
                            type: r.report_type,
                            user_description: userDescription,
                            ai_analysis: aiAnalysis,
                            file_url: url,
                            date: r.created_at
                        };
                    })
                });
            },
            {
                name: 'get_patient_medical_profile',
                description: 'View your own medical history and uploaded reports. RESTRICTED: You can only access your own profile.',
                schema: z.object({
                    patient_id: z.number().optional().describe('Your Internal Patient ID'),
                    mrn: z.string().optional().describe('Your Medical Record Number')
                })
            }
        ));
    }
    else if (user.role === 'admin') {
        tools.push(tool(
            async ({ mrn, doctor_id, doctor_name_confirmation, date, slot_start }) => {
                // Resolve MRN to patient_id
                const patient = await UserService.getPatientByMRN(mrn);
                if (!patient) {
                    return `Error: No patient found with MRN ${mrn}. Please verify the MRN or register the patient first using 'create_patient'.`;
                }

                const doctor = await HospitalService.getDoctorById(doctor_id);
                if (!doctor) return `Error: Doctor ID ${doctor_id} does not exist.`;

                if (!doctor.name.toLowerCase().includes(doctor_name_confirmation.toLowerCase())) {
                    return `ERROR: Doctor ID ${doctor_id} belongs to ${doctor.name}, but you provided ${doctor_name_confirmation}.`;
                }

                try {
                    const code = await AppointmentService.createAppointment(patient.id, doctor_id, date, slot_start);
                    await AuditService.log(user.userId, 'ADMIN_CREATE_APPOINTMENT', { mrn, patient_id: patient.id, doctor_id, date, slot_start, code });
                    return `Successfully booked appointment for ${patient.first_name} ${patient.last_name} (${mrn}) with ${doctor.name}. Confirmation Code: ${code}`;
                } catch (e: any) {
                    console.error('Admin booking error:', e);
                    return `Error booking appointment: ${e.message || 'Unknown error'}. Please verify the slot is available and try again.`;
                }
            },
            {
                name: 'create_appointment',
                description: 'Book an appointment for a patient using their MRN. The patient must already exist in the system. Always provide the doctor_name_confirmation.',
                schema: z.object({
                    mrn: z.string().describe('Medical Record Number (e.g., MRN-1770229938588-282)'),
                    doctor_id: z.number(),
                    doctor_name_confirmation: z.string().describe('The name of the doctor'),
                    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                    slot_start: z.string()
                }),
            }
        ));
    }

    // 8. update_appointment
    if (user.role === 'patient' || user.role === 'admin') {
        tools.push(tool(
            async ({ confirmation_code, date, slot_start }) => {
                try {
                    await AppointmentService.updateAppointment(
                        confirmation_code,
                        date,
                        slot_start,
                        user.role === 'patient' ? user.patientId : undefined
                    );
                    await AuditService.log(user.userId, 'UPDATE_APPOINTMENT', { confirmation_code, date, slot_start });
                    return `Appointment updated to ${date} at ${slot_start}.`;
                } catch (e: any) {
                    return e.message || "Error updating appointment.";
                }
            },
            {
                name: 'update_appointment',
                description: 'Change the date or time of an existing appointment. You MUST have the exact confirmation_code. If you do not have it, call list_my_appointments (for patients) or list_patient_appointments (for admin) first to look it up.',
                schema: z.object({ confirmation_code: z.string().describe('The exact confirmation code from the appointment'), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('New date in YYYY-MM-DD format'), slot_start: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).describe('New time slot in HH:MM:SS format') }),
            }
        ));
    }

    // 9. cancel_appointment
    if (user.role === 'patient' || user.role === 'admin') {
        tools.push(tool(
            async ({ confirmation_code }) => {
                try {
                    await AppointmentService.cancelAppointment(
                        confirmation_code,
                        user.role === 'patient' ? user.patientId : undefined
                    );
                    await AuditService.log(user.userId, 'CANCEL_APPOINTMENT', { confirmation_code });
                    return "Appointment cancelled successfully.";
                } catch (e: any) {
                    return e.message || "Error cancelling appointment.";
                }
            },
            {
                name: 'cancel_appointment',
                description: 'Cancel an existing appointment using the confirmation code.',
                schema: z.object({ confirmation_code: z.string() }),
            }
        ));
    }

    // 10. list_my_appointments
    if (user.role === 'patient') {
        tools.push(tool(
            async ({ include_past }) => {
                const appointments = await AppointmentService.getAppointmentsByPatient(user.patientId);
                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

                const formatted = appointments.map((a: any) => ({
                    ...a,
                    scheduled_date: new Date(a.scheduled_date).toLocaleDateString('en-CA')
                }));

                const filtered = include_past
                    ? formatted
                    : formatted.filter((a: any) => new Date(a.scheduled_date) >= today);

                return JSON.stringify(filtered);
            },
            {
                name: 'list_my_appointments',
                description: 'List your scheduled appointments. By default, returns only UPCOMING appointments. Set include_past=true to see history.',
                schema: z.object({
                    include_past: z.boolean().optional().describe('Set to true to include past appointments.')
                }),
            }
        ));
    }

    // Admin Tools
    if (user.role === 'admin') {
        tools.push(tool(
            async ({ include_past }) => {
                const appointments = await AppointmentService.getAllAppointments();
                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

                const formatted = appointments.map((a: any) => ({
                    ...a,
                    scheduled_date: new Date(a.scheduled_date).toLocaleDateString('en-CA')
                }));

                const filtered = include_past
                    ? formatted
                    : formatted.filter((a: any) => new Date(a.scheduled_date) >= today);

                return JSON.stringify(filtered);
            },
            {
                name: 'list_all_appointments',
                description: 'List all appointments in the hospital. By default, returns only UPCOMING appointments. Set include_past=true to see history.',
                schema: z.object({
                    include_past: z.boolean().optional().describe('Set to true to include past appointments.')
                })
            }
        ));

        tools.push(tool(
            async ({ patient_id, include_past }) => {
                const appointments = await AppointmentService.getAppointmentsByPatient(patient_id);
                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

                const formatted = appointments.map((a: any) => ({
                    ...a,
                    scheduled_date: new Date(a.scheduled_date).toLocaleDateString('en-CA')
                }));

                const filtered = include_past
                    ? formatted
                    : formatted.filter((a: any) => new Date(a.scheduled_date) >= today);

                return JSON.stringify(filtered);
            },
            {
                name: 'list_patient_appointments',
                description: 'List appointments for a specific patient ID. By default, returns only UPCOMING appointments. Set include_past=true to see history.',
                schema: z.object({
                    patient_id: z.number(),
                    include_past: z.boolean().optional().describe('Set to true to include past appointments.')
                })
            }
        ));

        tools.push(tool(
            async () => {
                const overview = await HospitalService.getHospitalOverview();
                return `Hospital Stats: ${overview.doctors} Doctors, ${overview.patients} Patients. Appointments: ${overview.appointments.total} Total (${overview.appointments.active} Scheduled).`;
            },
            {
                name: 'get_hospital_overview',
                description: 'Get high-level hospital statistics.',
                schema: z.object({})
            }
        ));

        tools.push(tool(
            async ({ phone }) => {
                const patients = await UserService.getPatientByPhone(phone);
                return JSON.stringify(patients);
            },
            {
                name: 'get_patient_by_phone',
                description: 'Lookup patient details by phone number.',
                schema: z.object({ phone: z.string() })
            }
        ));

        tools.push(tool(
            async ({ patient_id }) => {
                const patient = await UserService.getPatientById(patient_id);
                return JSON.stringify(patient);
            },
            {
                name: 'get_patient_details',
                description: 'Get full details of a patient (including MRN) using their Internal ID.',
                schema: z.object({ patient_id: z.number() })
            }
        ));

        tools.push(tool(
            async ({ mrn }) => {
                const patient = await UserService.getPatientByMRN(mrn);
                return JSON.stringify(patient);
            },
            {
                name: 'get_patient_by_mrn',
                description: 'Lookup patient details using their unique Medical Record Number (MRN).',
                schema: z.object({ mrn: z.string() })
            }
        ));

        tools.push(tool(
            async ({ first_name, last_name, phone, dob, gender, address, city, email, allergies, chronic_diseases, current_medications, medical_notes }) => {
                // Check if patient already exists by phone
                const existing = await UserService.getPatientByPhone(phone);
                if (existing.length > 0) {
                    return `Patient already exists with phone ${phone}: ${existing[0].first_name} ${existing[0].last_name} (MRN: ${existing[0].mrn})`;
                }

                try {
                    const patient = await UserService.createPatient({
                        firstName: first_name,
                        lastName: last_name,
                        phone,
                        dob,
                        gender,
                        address,
                        city,
                        email,
                        allergies,
                        chronicDiseases: chronic_diseases,
                        currentMedications: current_medications,
                        healthNotes: medical_notes
                    });

                    await AuditService.log(user.userId, 'ADMIN_CREATE_PATIENT', { mrn: patient.mrn, phone });
                    return `Patient registered successfully!\nName: ${patient.first_name} ${patient.last_name}\nMRN: ${patient.mrn}\nYou can now book appointments using this MRN.`;
                } catch (e: any) {
                    console.error('Patient creation error:', e);
                    return `Error creating patient: ${e.message || 'Unknown error'}`;
                }
            },
            {
                name: 'create_patient',
                description: 'Register a new patient in the system. Returns the generated MRN which can be used to book appointments. Required: first_name, last_name, phone. Optional: dob, gender, address, city, email, allergies, chronic_diseases, current_medications, medical_notes.',
                schema: z.object({
                    first_name: z.string(),
                    last_name: z.string(),
                    phone: z.string().describe('Phone number (must be unique)'),
                    dob: z.string().optional().describe('Date of birth (YYYY-MM-DD)'),
                    gender: z.string().optional(),
                    address: z.string().optional(),
                    city: z.string().optional(),
                    email: z.string().optional(),
                    allergies: z.string().optional().describe('Patient allergies (comma-separated)'),
                    chronic_diseases: z.string().optional().describe('Chronic diseases (comma-separated)'),
                    current_medications: z.string().optional().describe('Current medications'),
                    medical_notes: z.string().optional().describe('General health notes or medical history')
                })
            }
        ));


        tools.push(tool(
            async ({ patient_id, mrn, allergies, chronic_diseases, current_medications, medical_notes }) => {
                let resolvedPatientId = patient_id;

                // Resolve MRN to ID if ID is missing but MRN is provided
                if (!resolvedPatientId && mrn) {
                    const patientByMrn = await UserService.getPatientByMRN(mrn);
                    if (!patientByMrn) return `Error: No patient found with MRN ${mrn}`;
                    resolvedPatientId = patientByMrn.id;
                }

                if (!resolvedPatientId) return "Error: You must provide either a Patient ID or an MRN.";

                // Validate at least one field is being updated
                if (!allergies && !chronic_diseases && !current_medications && !medical_notes) {
                    return "Error: Please provide at least one field to update (allergies, chronic_diseases, current_medications, or medical_notes).";
                }

                try {
                    const updated = await UserService.updatePatientMedicalInfo(resolvedPatientId, {
                        allergies,
                        chronicDiseases: chronic_diseases,
                        currentMedications: current_medications,
                        healthNotes: medical_notes
                    });

                    await AuditService.log(user.userId, 'ADMIN_UPDATE_PATIENT_MEDICAL', { patient_id: resolvedPatientId, mrn });
                    return `Successfully updated medical information for ${updated.first_name} ${updated.last_name} (MRN: ${updated.mrn})`;
                } catch (e: any) {
                    console.error('Patient update error:', e);
                    return `Error updating patient: ${e.message || 'Unknown error'}`;
                }
            },
            {
                name: 'update_patient',
                description: 'Update medical information for an existing patient. Provide either patient_id or mrn, and the fields you want to update.',
                schema: z.object({
                    patient_id: z.number().optional().describe('Internal Patient ID'),
                    mrn: z.string().optional().describe('Medical Record Number (e.g. MRN-123...)'),
                    allergies: z.string().optional().describe('Patient allergies (comma-separated)'),
                    chronic_diseases: z.string().optional().describe('Chronic diseases (comma-separated)'),
                    current_medications: z.string().optional().describe('Current medications'),
                    medical_notes: z.string().optional().describe('General health notes or medical history')
                })
            }
        ));

        tools.push(tool(
            async ({ patient_id, mrn }) => {
                let resolvedPatientId = patient_id;

                // Resolve MRN to ID if ID is missing but MRN is provided
                if (!resolvedPatientId && mrn) {
                    const patientByMrn = await UserService.getPatientByMRN(mrn);
                    if (!patientByMrn) return `Error: No patient found with MRN ${mrn}`;
                    resolvedPatientId = patientByMrn.id;
                }

                if (!resolvedPatientId) return "Error: You must provide either a Patient ID or an MRN.";

                const patient = await UserService.getPatientById(resolvedPatientId);
                if (!patient) return `Error: Patient with ID ${resolvedPatientId} not found.`;

                // Fetch medical reports
                const reports = await ReportService.getReportsByPatient(resolvedPatientId);

                // Calculate age
                const birthDate = new Date(patient.dob);
                const ageDifMs = Date.now() - birthDate.getTime();
                const ageDate = new Date(ageDifMs);
                const age = Math.abs(ageDate.getUTCFullYear() - 1970);

                // Return FULL profile (admins can see everything, including contact info)
                return JSON.stringify({
                    mrn: patient.mrn,
                    first_name: patient.first_name,
                    last_name: patient.last_name,
                    age: age,
                    dob: patient.dob,
                    gender: patient.gender,
                    phone: patient.phone,
                    email: patient.email,
                    address: patient.address,
                    city: patient.city,
                    blood_group: patient.blood_group,
                    medical_notes: patient.health_notes,
                    allergies: patient.allergies,
                    chronic_diseases: patient.chronic_diseases,
                    current_medications: patient.current_medications,
                    uploaded_reports: reports.map((r: any) => {
                        const filename = r.file_path.split('/').pop();
                        const baseUrl = process.env.PUBLIC_URL || process.env.API_URL || 'http://localhost:3000';
                        const url = `${baseUrl}/uploads/${filename}`;

                        // Parse description to separate user input and AI analysis
                        const parts = (r.description || '').split('--- AI ANALYSIS ---');
                        const userDescription = parts[0]?.trim() || '';
                        const aiAnalysis = parts[1]?.trim() || null;

                        return {
                            id: r.id,
                            file_name: r.file_name,
                            type: r.report_type,
                            user_description: userDescription,
                            ai_analysis: aiAnalysis,
                            file_url: url,
                            date: r.created_at
                        };
                    })
                });
            },
            {
                name: 'get_patient_medical_profile',
                description: 'View FULL patient profile including medical history, reports, and contact information. No restrictions for admin. Provide either patient_id or mrn.',
                schema: z.object({
                    patient_id: z.number().optional().describe('Internal Patient ID'),
                    mrn: z.string().optional().describe('Medical Record Number (e.g. MRN-123...)')
                })
            }
        ));
    }

    // Doctor specific tools
    if (user.role === 'doctor') {
        tools.push(tool(
            async ({ include_past }) => {
                const appointments = await AppointmentService.getAppointmentsByDoctor(user.doctorId);
                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Start of today

                const formatted = appointments.map((a: any) => ({
                    ...a,
                    scheduled_date: new Date(a.scheduled_date).toLocaleDateString('en-CA') // YYYY-MM-DD
                }));

                const filtered = include_past
                    ? formatted
                    : formatted.filter((a: any) => new Date(a.scheduled_date) >= today);

                return JSON.stringify(filtered);
            },
            {
                name: 'list_my_schedule_details',
                description: 'List my scheduled appointments with patient details. By default, returns only UPCOMING appointments (today + future). Set include_past=true to see history.',
                schema: z.object({
                    include_past: z.boolean().optional().describe('Set to true to include past appointments.')
                })
            }
        ));

        tools.push(tool(
            async ({ patient_id, mrn }) => {
                let resolvedPatientId = patient_id;

                // Resolve MRN to ID if ID is missing but MRN is provided
                if (!resolvedPatientId && mrn) {
                    const patientByMrn = await UserService.getPatientByMRN(mrn);
                    if (!patientByMrn) return `Error: No patient found with MRN ${mrn}`;
                    resolvedPatientId = patientByMrn.id;
                }

                if (!resolvedPatientId) return "Error: You must provide either a Patient ID or an MRN.";

                const isAssigned = await UserService.verifyDoctorPatientRelationship(user.doctorId, resolvedPatientId);
                if (!isAssigned) return "ACCESS DENIED: You are only allowed to view profiles of your own patients.";

                const patient = await UserService.getPatientById(resolvedPatientId);
                // Also fetch their medical reports
                const reports = await ReportService.getReportsByPatient(resolvedPatientId);

                // Calculate simple age
                const birthDate = new Date(patient.dob);
                const ageDifMs = Date.now() - birthDate.getTime();
                const ageDate = new Date(ageDifMs); // miliseconds from epoch
                const age = Math.abs(ageDate.getUTCFullYear() - 1970);

                // Return ONLY strict medical profile (No PII like address/phone)
                // We keep name so doctor knows who they are looking at, but remove contact details.
                return JSON.stringify({
                    first_name: patient.first_name,
                    last_name: patient.last_name,
                    age: age,
                    gender: patient.gender,
                    blood_group: patient.blood_group,
                    medical_notes: patient.health_notes, // History/Notes
                    allergies: patient.allergies,
                    chronic_diseases: patient.chronic_diseases,
                    current_medications: patient.current_medications,
                    uploaded_reports: reports.map((r: any) => {
                        // Normalize path: 'uploads/file.png' or './uploads/file.png' -> http://localhost:3000/uploads/file.png
                        const filename = r.file_path.split('/').pop();
                        const baseUrl = process.env.PUBLIC_URL || process.env.API_URL || 'http://localhost:3000';
                        const url = `${baseUrl}/uploads/${filename}`;

                        return {
                            id: r.id,
                            file_name: r.file_name,
                            type: r.report_type,
                            description: r.description,
                            file_url: url, // <-- EXPOSED URL
                            date: r.created_at
                        };
                    })
                });
            },
            {
                name: 'get_patient_medical_profile',
                description: 'View STRICT medical profile of a patient (Age, Gender, Med History, Reports). Does NOT show contact info. RESTRICTED: Only for your own patients. Provide either patient_id or mrn.',
                schema: z.object({
                    patient_id: z.number().optional().describe('Internal Patient ID'),
                    mrn: z.string().optional().describe('Medical Record Number (e.g. MRN-123...)')
                })
            }
        ));

        tools.push(tool(
            async ({ mrn, file_name, description, report_type }) => {
                // 1. Resolve MRN to Patient ID
                const patient = await UserService.getPatientByMRN(mrn);
                if (!patient) {
                    return `Error: No patient found with MRN ${mrn}. Please verify the MRN and try again.`;
                }

                // 2. Verify Doctor-Patient Relationship
                const isAssigned = await UserService.verifyDoctorPatientRelationship(user.doctorId, patient.id);
                if (!isAssigned) {
                    return `Access Denied: The patient with MRN ${mrn} is not currently assigned to you. You can only upload reports for your own patients. Please verify the MRN or contact administration.`;
                }

                // 3. Log the report
                // In a real chat interface, the file would be uploaded separately. 
                // We'll create a record with a placeholder path.
                try {
                    const report = await ReportService.createReport(
                        patient.id,
                        user.doctorId,
                        file_name,
                        '/uploads/placeholder-' + file_name, // Placeholder path
                        report_type,
                        description
                    );
                    return `Report logged successfully for patient ${patient.first_name} ${patient.last_name} (${mrn}). Report ID: ${report.id}`;
                } catch (e: any) {
                    console.error('Report upload error:', e);
                    return `Error logging report: ${e.message || 'Unknown error'}`;
                }
            },
            {
                name: 'log_medical_report',
                description: 'Log a medical report or file for a patient using their MRN. RESTRICTED: You can only upload reports for patients currently assigned to you.',
                schema: z.object({
                    mrn: z.string().describe('Medical Record Number (e.g. MRN-123...)'),
                    file_name: z.string(),
                    description: z.string(),
                    report_type: z.enum(['X-Ray', 'Lab Report', 'Prescription', 'Other'])
                })
            }
        ));
    }

    return tools;
};
