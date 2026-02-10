-- HMS Bot Database Schema (Updated with client requirements)
-- Drop tables in correct order to avoid FK conflicts
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_sessions CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS schedules CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS doctors CASCADE;
DROP TABLE IF EXISTS patients CASCADE;
DROP TABLE IF EXISTS departments CASCADE;
DROP TABLE IF EXISTS hospitals CASCADE;

-- Hospitals table
CREATE TABLE hospitals (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    address TEXT,
    phone VARCHAR(50)
);

-- Departments table (flat list, no hierarchy)
CREATE TABLE departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    hospital_id INTEGER REFERENCES hospitals(id)
);

-- Doctors table (extended with client fields)
CREATE TABLE doctors (
    id SERIAL PRIMARY KEY,
    doctor_code VARCHAR(20) UNIQUE,
    employee_id VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    department_id INTEGER REFERENCES departments(id),
    designation VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave')),
    joining_date DATE,
    phone VARCHAR(50),
    email VARCHAR(255),
    cnic VARCHAR(20),
    bio TEXT,
    qualifications TEXT,
    specialization VARCHAR(100),
    sub_specialty VARCHAR(100),
    experience TEXT,
    contact_info VARCHAR(255),
    -- Bank details (for payroll, not used by agent)
    bank_name VARCHAR(100),
    account_title VARCHAR(255),
    iban VARCHAR(50),
    branch_code VARCHAR(20)
);

-- Patients table (extended with client fields)
CREATE TABLE patients (
    id SERIAL PRIMARY KEY,
    mrn VARCHAR(50) UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    dob DATE,
    gender VARCHAR(20),
    phone VARCHAR(50) UNIQUE,
    email VARCHAR(255),
    address TEXT,
    country VARCHAR(100),
    state_province VARCHAR(100),
    city VARCHAR(100),
    marital_status VARCHAR(30),
    blood_group VARCHAR(10),
    -- Emergency contact
    emergency_contact_name VARCHAR(255),
    emergency_contact_relation VARCHAR(50),
    emergency_contact_phone VARCHAR(50),
    -- Medical info (comma-separated text)
    allergies TEXT,
    chronic_diseases TEXT,
    current_medications TEXT,
    -- Generic health notes
    health_notes TEXT
);

-- Schedules table (DATE-SPECIFIC, not day-of-week)
CREATE TABLE schedules (
    id SERIAL PRIMARY KEY,
    doctor_id INTEGER REFERENCES doctors(id),
    schedule_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    -- Prevent duplicate schedule entries
    UNIQUE (doctor_id, schedule_date, start_time)
);

-- Users table with role-based access fields
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('patient', 'doctor', 'admin')),
    patient_id INTEGER,
    doctor_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Appointments table
CREATE TABLE appointments (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id),
    doctor_id INTEGER REFERENCES doctors(id),
    scheduled_date DATE NOT NULL,
    slot_start TIME NOT NULL,
    slot_end TIME NOT NULL,
    status VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
    confirmation_code VARCHAR(100) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Prevent double booking (only for non-cancelled appointments)
    UNIQUE (doctor_id, scheduled_date, slot_start)
);

-- Medical Reports/Files (Images, PDFs, etc.)
CREATE TABLE medical_reports (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id), -- Linked to patient
    doctor_id INTEGER REFERENCES doctors(id),   -- Uploaded by doctor
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    report_type VARCHAR(50), -- 'X-Ray', 'Lab Report', 'Prescription', 'Other'
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add Foreign Key constraints for users table
ALTER TABLE users ADD CONSTRAINT fk_users_patient FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE users ADD CONSTRAINT fk_users_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id);

-- Audit logs
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chat sessions
CREATE TABLE chat_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    title TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chat messages
CREATE TABLE chat_messages (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
