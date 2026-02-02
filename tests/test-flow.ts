import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;

async function testFlow() {
    console.log('--- Starting Full Flow Test ---');
    try {
        // 1. Login as Patient
        console.log('\n[1] Logging in as Patient (Alice)...');
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'alice@example.com',
            password: 'alice123'
        });
        const token = (loginRes.data as any).token;
        console.log('Login successful.');

        const authHeader = { Authorization: `Bearer ${token}` };

        // 2. Chat: Ask for doctors
        console.log('\n[2] Asking for doctors via Chat...');
        const chatRes1 = await axios.post(`${BASE_URL}/chat`,
            { message: 'Which doctors are available in Cardiology?' },
            { headers: authHeader }
        );
        console.log('AI Response:', (chatRes1.data as any).response);

        // 3. Chat: Check schedule for Dr. Smith
        console.log('\n[3] Checking schedule for Dr. Smith...');
        const chatRes2 = await axios.post(`${BASE_URL}/chat`,
            {
                message: 'What is the schedule for Dr. John Smith?',
                history: [
                    { role: 'user', content: 'Which doctors are available in Cardiology?' },
                    { role: 'assistant', content: (chatRes1.data as any).response }
                ]
            },
            { headers: authHeader }
        );
        console.log('AI Response:', (chatRes2.data as any).response);

        // 4. Chat: Book an appointment
        console.log('\n[4] Booking appointment...');
        const chatRes3 = await axios.post(`${BASE_URL}/chat`,
            {
                message: 'Book an appointment with Dr. John Smith for 2026-02-10 at 09:00:00',
                history: [
                    { role: 'user', content: 'What is the schedule for Dr. John Smith?' },
                    { role: 'assistant', content: (chatRes2.data as any).response }
                ]
            },
            { headers: authHeader }
        );
        console.log('AI Response:', (chatRes3.data as any).response);

        // 5. Chat: List appointments
        console.log('\n[5] Listing my appointments...');
        const chatRes4 = await axios.post(`${BASE_URL}/chat`,
            { message: 'List my appointments' },
            { headers: authHeader }
        );
        console.log('AI Response:', (chatRes4.data as any).response);

        console.log('\n--- Full Flow Test Completed ---');
    } catch (err: any) {
        console.error('Test Flow Failed:', err.response?.data || err.message);
    }
}

testFlow();
