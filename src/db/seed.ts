import { Client } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function seed() {
  try {
    await client.connect();
    console.log('Connected to database for seeding.');

    // Clean tables (caution!)
    await client.query('TRUNCATE appointments, schedules, users, doctors, departments, patients, hospitals RESTART IDENTITY CASCADE');

    // 1. Hospital
    const hospitalRes = await client.query(
      'INSERT INTO hospitals (name, address, phone) VALUES ($1, $2, $3) RETURNING id',
      ['Abbasi Hospital', '123 Health Ave, Medical District', '555-0100']
    );
    const hospitalId = hospitalRes.rows[0].id;

    // 2. Departments
    const cardiologyRes = await client.query('INSERT INTO departments (name, hospital_id) VALUES ($1, $2) RETURNING id', ['Cardiology', hospitalId]);
    const orthopedicsRes = await client.query('INSERT INTO departments (name, hospital_id) VALUES ($1, $2) RETURNING id', ['Orthopedics', hospitalId]);
    const pediatricsRes = await client.query('INSERT INTO departments (name, hospital_id) VALUES ($1, $2) RETURNING id', ['Pediatrics', hospitalId]);
    const neurologyRes = await client.query('INSERT INTO departments (name, hospital_id) VALUES ($1, $2) RETURNING id', ['Neurology', hospitalId]);
    const dermatologyRes = await client.query('INSERT INTO departments (name, hospital_id) VALUES ($1, $2) RETURNING id', ['Dermatology', hospitalId]);
    const oncologyRes = await client.query('INSERT INTO departments (name, hospital_id) VALUES ($1, $2) RETURNING id', ['Oncology', hospitalId]);

    const cardioId = cardiologyRes.rows[0].id;
    const orthoId = orthopedicsRes.rows[0].id;
    const pedsId = pediatricsRes.rows[0].id;
    const neuroId = neurologyRes.rows[0].id;
    const dermId = dermatologyRes.rows[0].id;
    const oncoId = oncologyRes.rows[0].id;

    // 3. Doctors
    const drSmithRes = await client.query(
      'INSERT INTO doctors (name, department_id, bio, contact_info) VALUES ($1, $2, $3, $4) RETURNING id',
      ['Dr. John Smith', cardioId, 'Senior Cardiologist with 20 years experience.', 'drsmith@abbasi.com']
    );
    const drSarahRes = await client.query(
      'INSERT INTO doctors (name, department_id, bio, contact_info) VALUES ($1, $2, $3, $4) RETURNING id',
      ['Dr. Sarah Johnson', cardioId, 'Specialist in pediatric cardiology and heart rhythm.', 'sjohnson@abbasi.com']
    );
    const drDoeRes = await client.query(
      'INSERT INTO doctors (name, department_id, bio, contact_info) VALUES ($1, $2, $3, $4) RETURNING id',
      ['Dr. Jane Doe', orthoId, 'Orthopedic Surgeon specializing in sports medicine.', 'drdoe@abbasi.com']
    );
    const drMillerRes = await client.query(
      'INSERT INTO doctors (name, department_id, bio, contact_info) VALUES ($1, $2, $3, $4) RETURNING id',
      ['Dr. David Miller', orthoId, 'Expert in joint replacement and spinal surgery.', 'dmiller@abbasi.com']
    );
    const drEmilyRes = await client.query(
      'INSERT INTO doctors (name, department_id, bio, contact_info) VALUES ($1, $2, $3, $4) RETURNING id',
      ['Dr. Emily Brown', pedsId, 'Compassionate pediatrician focusing on developmental health.', 'ebrown@abbasi.com']
    );
    const drMichaelRes = await client.query(
      'INSERT INTO doctors (name, department_id, bio, contact_info) VALUES ($1, $2, $3, $4) RETURNING id',
      ['Dr. Michael Wilson', neuroId, 'Neurologist specialized in stroke and epilepsy management.', 'mwilson@abbasi.com']
    );

    const smithId = drSmithRes.rows[0].id;
    const sarahId = drSarahRes.rows[0].id;
    const doeId = drDoeRes.rows[0].id;
    const millerId = drMillerRes.rows[0].id;
    const emilyId = drEmilyRes.rows[0].id;
    const michaelId = drMichaelRes.rows[0].id;

    // 4. Patients
    const patientAliceRes = await client.query(
      'INSERT INTO patients (first_name, last_name, phone, dob, gender, address) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      ['Alice', 'Wonder', '555-1234', '1990-01-01', 'Female', '456 Wonderland Way']
    );
    const patientBobRes = await client.query(
      'INSERT INTO patients (first_name, last_name, phone, dob, gender, address) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      ['Bob', 'Builder', '555-5678', '1985-05-20', 'Male', 'Construction Lane 7']
    );
    const patientCharlieRes = await client.query(
      'INSERT INTO patients (first_name, last_name, phone, dob, gender, address) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      ['Charlie', 'Chocolate', '555-9999', '2000-12-12', 'Non-binary', 'Candy Factory Road']
    );
    const aliceId = patientAliceRes.rows[0].id;
    const bobId = patientBobRes.rows[0].id;
    const charlieId = patientCharlieRes.rows[0].id;

    // 5. Users
    const salt = await bcrypt.genSalt(10);
    const adminPass = await bcrypt.hash('admin123', salt);
    const patientPass = await bcrypt.hash('alice123', salt);
    const bobPass = await bcrypt.hash('bob123', salt);
    const charliePass = await bcrypt.hash('charlie123', salt);
    const doctorPass = await bcrypt.hash('smith123', salt);
    const janePass = await bcrypt.hash('jane123', salt);

    await client.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)',
      ['admin@abbasi.com', adminPass, 'admin']
    );
    await client.query(
      'INSERT INTO users (email, password_hash, role, patient_id) VALUES ($1, $2, $3, $4)',
      ['alice@example.com', patientPass, 'patient', aliceId]
    );
    await client.query(
      'INSERT INTO users (email, password_hash, role, patient_id) VALUES ($1, $2, $3, $4)',
      ['bob@example.com', bobPass, 'patient', bobId]
    );
    await client.query(
      'INSERT INTO users (email, password_hash, role, patient_id) VALUES ($1, $2, $3, $4)',
      ['charlie@example.com', charliePass, 'patient', charlieId]
    );
    await client.query(
      'INSERT INTO users (email, password_hash, role, doctor_id) VALUES ($1, $2, $3, $4)',
      ['smith@abbasi.com', doctorPass, 'doctor', smithId]
    );
    await client.query(
      'INSERT INTO users (email, password_hash, role, doctor_id) VALUES ($1, $2, $3, $4)',
      ['jane@abbasi.com', janePass, 'doctor', doeId]
    );

    // 6. Schedules
    const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    for (const day of weekDays) {
      // Cardiology (Morning vs Afternoon)
      await client.query('INSERT INTO schedules (doctor_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4)', [smithId, day, '09:00:00', '13:00:00']);
      await client.query('INSERT INTO schedules (doctor_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4)', [sarahId, day, '14:00:00', '18:00:00']);

      // Orthopedics
      await client.query('INSERT INTO schedules (doctor_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4)', [doeId, day, '09:00:00', '12:00:00']);
      await client.query('INSERT INTO schedules (doctor_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4)', [millerId, day, '13:00:00', '17:00:00']);

      // Pediatrics & Neurology
      await client.query('INSERT INTO schedules (doctor_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4)', [emilyId, day, '08:00:00', '12:00:00']);
      await client.query('INSERT INTO schedules (doctor_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4)', [michaelId, day, '10:00:00', '15:00:00']);
    }

    console.log('Seed completed successfully.');
  } catch (err) {
    console.error('Error during seeding:', err);
  } finally {
    await client.end();
  }
}

seed();
