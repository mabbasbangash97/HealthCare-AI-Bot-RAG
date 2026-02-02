import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import dotenv from 'dotenv';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { OpenAIEmbeddings } from '@langchain/openai';
import { AppointmentService } from '../services/AppointmentService';
import { HospitalService } from '../services/HospitalService';
import { UserService } from '../services/UserService';
import { AuditService } from '../services/AuditService';

dotenv.config();

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
            description: 'Get your own profile details (name, etc.). Use this to find out who you are talking to/who you are.',
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
            description: 'Get generic OPD schedule for a doctor.',
            schema: z.object({ doctor_id: z.number() }),
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
                description: 'Get available 30-minute time slots.',
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
                const doctor = await HospitalService.getDoctorById(doctor_id);
                if (!doctor) return `Error: Doctor ID ${doctor_id} does not exist.`;

                if (!doctor.name.toLowerCase().includes(doctor_name_confirmation.toLowerCase())) {
                    return `ERROR: Doctor ID ${doctor_id} belongs to ${doctor.name}, but you provided ${doctor_name_confirmation}.`;
                }

                try {
                    const code = await AppointmentService.createAppointment(patient_id, doctor_id, date, slot_start);
                    await AuditService.log(user.userId, 'ADMIN_CREATE_APPOINTMENT', { patient_id, doctor_id, date, slot_start, code });
                    return `Admin: Booked ${doctor.name} for patient ID ${patient_id}. Code: ${code}`;
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
                description: 'Change the date or time of an existing appointment.',
                schema: z.object({ confirmation_code: z.string(), date: z.string(), slot_start: z.string() }),
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
            async () => {
                const appointments = await AppointmentService.getAppointmentsByPatient(user.patientId);
                return JSON.stringify(appointments);
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
                const appointments = await AppointmentService.getAllAppointments();
                return JSON.stringify(appointments);
            },
            {
                name: 'list_all_appointments',
                description: 'List all appointments in the hospital.',
                schema: z.object({})
            }
        ));

        tools.push(tool(
            async ({ patient_id }) => {
                const appointments = await AppointmentService.getAppointmentsByPatient(patient_id);
                return JSON.stringify(appointments);
            },
            {
                name: 'list_patient_appointments',
                description: 'List appointments for a specific patient ID.',
                schema: z.object({ patient_id: z.number() })
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
                description: 'Get full details of a patient using their ID.',
                schema: z.object({ patient_id: z.number() })
            }
        ));
    }

    // Doctor specific tools
    if (user.role === 'doctor') {
        tools.push(tool(
            async () => {
                const appointments = await AppointmentService.getAppointmentsByDoctor(user.doctorId);
                return JSON.stringify(appointments);
            },
            {
                name: 'list_my_schedule_details',
                description: 'List my scheduled appointments with patient details.',
                schema: z.object({})
            }
        ));

        tools.push(tool(
            async ({ patient_id }) => {
                const isAssigned = await AppointmentService.verifyDoctorPatientRelationship(user.doctorId, patient_id);
                if (!isAssigned) return "This patient is not assigned to you.";

                const patient = await UserService.getPatientById(patient_id);
                return JSON.stringify(patient);
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
