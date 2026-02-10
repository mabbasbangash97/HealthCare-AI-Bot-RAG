import pool from './pool';
import bcrypt from 'bcrypt';

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Starting seed...');

    // 1. Clear existing data
    await client.query('TRUNCATE TABLE chat_messages, chat_sessions, audit_logs, appointments, users, schedules, doctors, patients, departments, hospitals RESTART IDENTITY CASCADE');

    // 2. Hospitals
    const hospitalRes = await client.query(
      'INSERT INTO hospitals (name, location, address, phone) VALUES ($1, $2, $3, $4) RETURNING id',
      ['Abbasi Hospital', 'Sunny Bank, Murree, Pakistan', 'Sunny Bank, Murree', '+92-51-1234567']
    );
    const hospitalId = hospitalRes.rows[0].id;

    // 3. Departments
    const departmentsList = [
      'Cardiology', 'Pulmonology', 'Gastroenterology & Hepatology', 'Nephrology', 'Endocrinology & Diabetology',
      'Rheumatology', 'Hematology', 'Infectious Diseases', 'Immunology & Allergy', 'Geriatrics', 'Family Medicine',
      'Neurology', 'Neurosurgery', 'Psychiatry',
      'General Surgery', 'Cardiothoracic & Vascular Surgery (CTVS)', 'Orthopedics', 'Urology', 'Plastic & Reconstructive Surgery',
      'Pediatric Surgery', 'Onco-Surgery', 'Bariatric & Laparoscopic Surgery', 'Transplant Surgery', 'Trauma & Emergency Surgery', 'Vascular Surgery',
      'Obstetrics & Gynecology (OB/GYN)', 'Maternal & Fetal Medicine', 'Pediatrics', 'Neonatology (NICU)', 'Adolescent Medicine',
      'Ophthalmology', 'ENT', 'Dermatology & Venereology', 'Dentistry & Oral & Maxillofacial Surgery',
      'Medical Oncology', 'Radiation Oncology', 'Surgical Oncology', 'Nuclear Medicine',
      'Emergency Medicine', 'Intensive Care Medicine (ICU/CCU)', 'Anesthesiology & Pain Medicine', 'Palliative Care',
      'Radiology & Imaging', 'Interventional Radiology', 'Pathology', 'Microbiology', 'Biochemistry', 'Hematopathology', 'Molecular Medicine & Genetics', 'Forensic Medicine',
      'Physical Medicine & Rehabilitation (PM&R)', 'Sports Medicine', 'Preventive & Lifestyle Medicine',
      'Physiotherapy', 'Occupational Therapy', 'Speech & Audiology', 'Clinical Nutrition & Dietetics', 'Clinical Psychology', 'Nursing', 'Pharmacy', 'Laboratory Sciences', 'Respiratory Therapy', 'Emergency Medical Services (EMS)'
    ];

    const depMap = new Map();
    for (const dep of departmentsList) {
      const res = await client.query('INSERT INTO departments (name, hospital_id) VALUES ($1, $2) RETURNING id', [dep, hospitalId]);
      depMap.set(dep, res.rows[0].id);
    }

    // 4. Doctors
    const salt = await bcrypt.genSalt(10);
    const defaultPass = await bcrypt.hash('password123', salt);

    // Dr. John Smith (Cardiology)
    const doc1Res = await client.query(`
      INSERT INTO doctors (
        doctor_code, employee_id, name, department_id, designation, status, joining_date, 
        contact_info, email, cnic, qualifications, specialization, sub_specialty, experience,
        bank_name, account_title, iban, branch_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id
    `, [
      '1001', 'doc_001', 'Dr. John Smith', depMap.get('Cardiology'), 'Senior Consultant', 'active', '2020-01-15',
      '+92-345-1234501', 'dr.john@abbasihospital.com', '35201-1234567-1',
      'MD Cardiology, Aga Khan University (2010-2014)', 'Cardiology', 'Interventional Cardiology',
      'Senior Cardiologist, Aga Khan University Hospital (2015-2019)\nCardiology Consultant, Shifa International Hospital (2020-2022)',
      'MCB Bank', 'Dr. John Smith', 'PK36MCIB0001234567890123', '122'
    ]);
    const doc1Id = doc1Res.rows[0].id;

    // Dr. Sarah Johnson (General Medicine -> Family Medicine)
    const doc2Res = await client.query(`
      INSERT INTO doctors (
        doctor_code, employee_id, name, department_id, designation, status, joining_date, 
        contact_info, email, cnic, qualifications, specialization, experience,
        bank_name, account_title, iban, branch_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id
    `, [
      '1002', 'doc_002', 'Dr. Sarah Johnson', depMap.get('Family Medicine'), 'General Practitioner', 'active', '2021-03-10',
      '+92-345-1234502', 'dr.sarah@abbasihospital.com', '35201-7654321-2',
      'MBBS, Shifa College of Medicine (2012-2016)', 'Family Medicine',
      'Medical Officer, PIMS (2016-2018)\nGeneral Physician, Holy Family Hospital (2018-2021)',
      'Allied Bank', 'Dr. Sarah Johnson', 'PK36ABPA0009876543210987', '737'
    ]);
    const doc2Id = doc2Res.rows[0].id;

    // Dr. Robert Brown (Orthopedics)
    const doc3Res = await client.query(`
      INSERT INTO doctors (
        doctor_code, employee_id, name, department_id, designation, status, joining_date, 
        contact_info, email, cnic, qualifications, specialization, sub_specialty, experience,
        bank_name, account_title, iban, branch_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id
    `, [
      '1003', 'doc_003', 'Dr. Robert Brown', depMap.get('Orthopedics'), 'Surgeon', 'active', '2019-07-22',
      '+92-345-1234503', 'dr.robert@abbasihospital.com', '35201-9876543-3',
      'FCPS Orthopedics, College of Physicians & Surgeons Pakistan (2008-2012)', 'Orthopedics', 'Joint Replacement',
      'Orthopedic Surgeon, AFIRM (2012-2017)',
      'Allied Bank', 'Dr. Robert Brown', 'PK36ABPA0009876543210988', '736'
    ]);
    const doc3Id = doc3Res.rows[0].id;

    // Dr. Ayesha Khan (Ophthalmology)
    const doc4Res = await client.query(`
      INSERT INTO doctors (
        doctor_code, employee_id, name, department_id, designation, status, joining_date, 
        contact_info, email, cnic, qualifications, specialization, sub_specialty, experience,
        bank_name, account_title, iban, branch_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id
    `, [
      '1004', 'doc_004', 'Dr. Ayesha Khan', depMap.get('Ophthalmology'), 'Senior Consultant', 'active', '2019-07-01',
      '+92-345-1234504', 'dr.ayesha@abbasihospital.com', '35201-4567890-4',
      'FRCS Ophthalmology, Royal College of Surgeons (2005-2009)', 'Ophthalmology', 'Cataract Surgery',
      'Ophthalmology Registrar, Al-Shifa Eye Hospital (2009-2013)\nConsultant Ophthalmologist, Al-Noor Eye Hospital (2014-2019)',
      'UBL Bank', 'Dr. Ayesha Khan', 'PK36UNIL0004567890123456', '739'
    ]);
    const doc4Id = doc4Res.rows[0].id;


    // 5. Patients
    const patientsData = [
      {
        first: 'Ahmed', last: 'Khan', dob: '1985-05-15', gender: 'Male', phone: '+92-345-1234567', email: 'ahmed.khan@email.com',
        address: 'House #45, Kashmir Point Road, Murree, Punjab, Pakistan', country: 'Pakistan', state: 'Punjab', city: 'Murree',
        marital: 'Married', blood: 'O+', ec_name: 'Fatima Khan', ec_rel: 'Wife', ec_phone: '+92-345-7654321',
        allergies: 'Peanuts, Eggs', chronic: 'Hypertension', meds: 'Amlodipine 5 mg once daily',
        health: 'Mild gingivitis, Stress, occasional headaches'
      },
      {
        first: 'Ayesha', last: 'Ali', dob: '1992-08-22', gender: 'Female', phone: '+92-345-2345678', email: 'ayesha.ali@email.com',
        address: 'Sunny Bank Colony, House #12, Murree, Punjab, Pakistan', country: 'Pakistan', state: 'Punjab', city: 'Murree',
        marital: 'Married', blood: 'A+', ec_name: 'Usman Ali', ec_rel: 'Husband', ec_phone: '+92-345-8765432',
        allergies: 'Penicillin', chronic: 'Hypertension', meds: 'Iron supplements',
        health: 'Early gingivitis, History of iron-deficiency anemia'
      },
      {
        first: 'Zain', last: 'Ahmed', dob: '2018-03-10', gender: 'Male', phone: '+92-345-3456789', email: 'parent.ahmed@email.com',
        address: 'Upper Topa, House #23, Murree, Punjab, Pakistan', country: 'Pakistan', state: 'Punjab', city: 'Murree',
        marital: 'N/A (Child)', blood: 'B+', ec_name: 'Fatima', ec_rel: 'Wife', ec_phone: '+92-345-8765433',
        allergies: 'Dust allergy', chronic: 'Obesity', meds: 'Cetirizine syrup as needed',
        health: 'Healthy gums, Recurrent seasonal flu'
      },
      {
        first: 'Fatima', last: 'Bibi', dob: '1955-10-10', gender: 'Female', phone: '+92-345-4567890', email: 'fatima.bibi@email.com',
        address: 'Lower Topa, House #34, Murree, Punjab, Pakistan', country: 'Pakistan', state: 'Punjab', city: 'Murree',
        marital: 'Widowed', blood: 'O-', ec_name: 'Hassan Raza', ec_rel: 'Son', ec_phone: '+92-345-9876543',
        allergies: 'Sulfa drugs', chronic: 'Type 2 diabetes, hypertension', meds: 'Metformin, Losartan, Aspirin',
        health: 'Moderate periodontal disease, Arthritis, limited mobility'
      },
      {
        first: 'David', last: 'Miller', dob: '1984-06-15', gender: 'Male', phone: '+1-212-555-0123', email: 'david.miller@email.com',
        address: 'Pearl Continental Hotel, Room 205, Mall Road, Murree', country: 'United States', state: 'New York', city: 'Murree (Temporary)',
        marital: 'Married', blood: 'A-', ec_name: 'Anna Miller', ec_rel: 'Wife', ec_phone: '+1-212-555-0234',
        allergies: 'Shellfish', chronic: 'Allergic rhinitis', meds: 'Ibuprofen as needed',
        health: 'Mild gum recession, Seasonal allergic rhinitis'
      },
      {
        first: 'Sarah', last: 'Wilson', dob: '1993-09-22', gender: 'Female', phone: '+44-7890-123456', email: 'sarah.wilson@email.com',
        address: 'Hotel One, Room 308, Murree', country: 'United Kingdom', state: 'England', city: 'Murree (Temporary)',
        marital: 'Unmarried', blood: 'A+', ec_name: 'Mike Wilson', ec_rel: 'Brother', ec_phone: '+44-7890-654321',
        allergies: 'Lactose intolerance', chronic: 'Mild asthma', meds: 'Salbutamol inhaler',
        health: 'Healthy gums, Occasional exercise-induced breathlessness'
      }
    ];

    const patientIds = [];
    for (const p of patientsData) {
      const pRes = await client.query(`
        INSERT INTO patients (
          first_name, last_name, dob, gender, phone, email, address, country, state_province, city,
          marital_status, blood_group, emergency_contact_name, emergency_contact_relation, emergency_contact_phone,
          allergies, chronic_diseases, current_medications, health_notes, mrn
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) RETURNING id
      `, [
        p.first, p.last, p.dob, p.gender, p.phone, p.email, p.address, p.country, p.state, p.city,
        p.marital, p.blood, p.ec_name, p.ec_rel, p.ec_phone,
        p.allergies, p.chronic, p.meds, p.health, `MRN-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      ]);
      patientIds.push(pRes.rows[0].id);
    }

    // 6. Users (Create login for Admin, all Doctors, and all Patients)
    // Admin
    await client.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', ['admin@abbasi.com', defaultPass, 'admin']);

    // Doctors
    await client.query('INSERT INTO users (email, password_hash, role, doctor_id) VALUES ($1, $2, $3, $4)', ['dr.john@abbasihospital.com', defaultPass, 'doctor', doc1Id]);
    await client.query('INSERT INTO users (email, password_hash, role, doctor_id) VALUES ($1, $2, $3, $4)', ['dr.sarah@abbasihospital.com', defaultPass, 'doctor', doc2Id]);
    await client.query('INSERT INTO users (email, password_hash, role, doctor_id) VALUES ($1, $2, $3, $4)', ['dr.robert@abbasihospital.com', defaultPass, 'doctor', doc3Id]);
    await client.query('INSERT INTO users (email, password_hash, role, doctor_id) VALUES ($1, $2, $3, $4)', ['dr.ayesha@abbasihospital.com', defaultPass, 'doctor', doc4Id]);

    // Patients
    for (let i = 0; i < patientsData.length; i++) {
      await client.query('INSERT INTO users (email, password_hash, role, patient_id) VALUES ($1, $2, $3, $4)', [patientsData[i].email, defaultPass, 'patient', patientIds[i]]);
    }

    // 7. Schedules (Feb 2026 data converted to date-specific ranges)
    // Helper to insert schedule
    const insertSched = async (docId: number, date: string, start: string, end: string) => {
      await client.query(
        'INSERT INTO schedules (doctor_id, schedule_date, start_time, end_time) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [docId, date, start, end]
      );
    };

    // Data parsing logic from client text
    // Dr. John Smith (1)
    await insertSched(doc1Id, '2026-02-02', '06:00', '12:00'); await insertSched(doc1Id, '2026-02-02', '12:00', '18:00');
    await insertSched(doc1Id, '2026-02-03', '06:00', '12:00'); await insertSched(doc1Id, '2026-02-03', '12:00', '18:00');
    await insertSched(doc1Id, '2026-02-04', '12:00', '18:00');
    await insertSched(doc1Id, '2026-02-05', '06:00', '12:00'); await insertSched(doc1Id, '2026-02-05', '12:00', '18:00');
    await insertSched(doc1Id, '2026-02-06', '06:00', '12:00');
    await insertSched(doc1Id, '2026-02-07', '06:00', '12:00');
    await insertSched(doc1Id, '2026-02-08', '12:00', '18:00');
    await insertSched(doc1Id, '2026-02-09', '06:00', '12:00'); await insertSched(doc1Id, '2026-02-09', '12:00', '18:00');
    await insertSched(doc1Id, '2026-02-10', '06:00', '12:00'); await insertSched(doc1Id, '2026-02-10', '12:00', '18:00');
    await insertSched(doc1Id, '2026-02-11', '12:00', '18:00');
    await insertSched(doc1Id, '2026-02-12', '06:00', '12:00'); await insertSched(doc1Id, '2026-02-12', '12:00', '18:00');

    // Dr. Sarah Johnson (2)
    await insertSched(doc2Id, '2026-02-02', '12:00', '18:00');
    await insertSched(doc2Id, '2026-02-03', '06:00', '12:00');
    await insertSched(doc2Id, '2026-02-04', '06:00', '12:00'); await insertSched(doc2Id, '2026-02-04', '12:00', '18:00');
    await insertSched(doc2Id, '2026-02-05', '06:00', '12:00'); await insertSched(doc2Id, '2026-02-05', '12:00', '18:00');
    await insertSched(doc2Id, '2026-02-06', '06:00', '12:00'); await insertSched(doc2Id, '2026-02-06', '12:00', '18:00');
    await insertSched(doc2Id, '2026-02-07', '06:00', '12:00');
    await insertSched(doc2Id, '2026-02-08', '00:00', '06:00'); // 12AM-6AM in database TIME
    await insertSched(doc2Id, '2026-02-09', '12:00', '18:00');
    await insertSched(doc2Id, '2026-02-10', '06:00', '12:00'); await insertSched(doc2Id, '2026-02-10', '12:00', '18:00');

    // Dr. Robert Brown (3)
    await insertSched(doc3Id, '2026-02-02', '12:00', '18:00');
    await insertSched(doc3Id, '2026-02-03', '12:00', '18:00');
    await insertSched(doc3Id, '2026-02-05', '12:00', '18:00');
    await insertSched(doc3Id, '2026-02-06', '12:00', '18:00'); await insertSched(doc3Id, '2026-02-06', '18:00', '24:00');
    await insertSched(doc3Id, '2026-02-07', '06:00', '12:00');
    await insertSched(doc3Id, '2026-02-08', '18:00', '24:00');
    await insertSched(doc3Id, '2026-02-09', '12:00', '18:00');
    await insertSched(doc3Id, '2026-02-10', '12:00', '18:00');
    await insertSched(doc3Id, '2026-02-12', '12:00', '18:00');

    // Dr. Ayesha Khan (4)
    await insertSched(doc4Id, '2026-02-02', '06:00', '12:00');
    await insertSched(doc4Id, '2026-02-03', '06:00', '12:00');
    await insertSched(doc4Id, '2026-02-04', '06:00', '12:00'); await insertSched(doc4Id, '2026-02-04', '12:00', '18:00');
    await insertSched(doc4Id, '2026-02-05', '12:00', '18:00');
    await insertSched(doc4Id, '2026-02-06', '06:00', '12:00'); await insertSched(doc4Id, '2026-02-06', '18:00', '24:00');
    await insertSched(doc4Id, '2026-02-07', '06:00', '12:00');
    await insertSched(doc4Id, '2026-02-08', '12:00', '18:00');
    await insertSched(doc4Id, '2026-02-09', '06:00', '12:00');
    await insertSched(doc4Id, '2026-02-10', '06:00', '12:00');

    console.log('Seed completed successfully.');
  } catch (err) {
    console.error('Seed failed:', err);
  } finally {
    client.release();
  }
}

seed();
