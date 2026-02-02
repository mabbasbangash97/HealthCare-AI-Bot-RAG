-- Users table with role-based access fields
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('patient', 'doctor', 'admin')),
    patient_id INTEGER, -- FK to patients table, nullable
    doctor_id INTEGER,  -- FK to doctors table, nullable
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Hospitals table (for context, though essentially single tenant for now)
CREATE TABLE hospitals (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    phone VARCHAR(50)
);

-- Departments table
CREATE TABLE departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    hospital_id INTEGER REFERENCES hospitals(id)
);

-- Doctors table
CREATE TABLE doctors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    department_id INTEGER REFERENCES departments(id),
    bio TEXT,
    contact_info VARCHAR(255)
);

-- Patients table
CREATE TABLE patients (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(50) UNIQUE,
    dob DATE,
    gender VARCHAR(20),
    address TEXT
);

-- Schedules table (OPD windows)
-- Stores generic weekly schedules or specific date ranges. 
-- For simplicity, let's assume specific dates or day_of_week based.
-- Architecture doc says: "OPD Feb 2: 6AM-12PM". Let's stick to concrete dates/times for availability for now, or day of week pattern.
-- Let's go with Day of Week for recurring, and specific overrides if needed. 
-- Actually, doc mentions "get_doctor_schedule... from_date, to_date", implying potentially specific slots or recurring.
-- Let's stick to a simple model: specific availability windows per doctor.
CREATE TABLE schedules (
    id SERIAL PRIMARY KEY,
    doctor_id INTEGER REFERENCES doctors(id),
    day_of_week VARCHAR(10), -- 'Monday', etc. OR null if specific date
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    valid_from DATE, 
    valid_to DATE
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
    -- Prevent double booking: simplified unique constraint
    -- A doctor cannot have two appointments starting at the same time on the same date.
    UNIQUE (doctor_id, scheduled_date, slot_start)
);

-- Add Foreign Key constraints for users table after other tables exist
ALTER TABLE users ADD CONSTRAINT fk_users_patient FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE users ADD CONSTRAINT fk_users_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id);
