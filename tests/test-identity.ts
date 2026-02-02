import { runAgent } from '../src/agent';
import dotenv from 'dotenv';
dotenv.config();

async function testIdentity() {
    console.log('--- Testing Agent Identity ---');
    const adminUser = { role: 'admin', userId: 1, patientId: null, doctorId: null };

    // 1. Check identity
    console.log('\n[1] Question: Who am I? (as Admin)');
    const resp1 = await runAgent(adminUser, 'who am i');
    console.log('Response:', resp1);

    // 2. Check typo handling
    console.log('\n[2] Question: how mannu appointments are booked? (Simulating typo)');
    const resp2 = await runAgent(adminUser, 'how mannu appointments are booked');
    console.log('Response:', resp2);
}

testIdentity();
