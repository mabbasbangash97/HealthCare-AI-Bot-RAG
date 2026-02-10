import dotenv from 'dotenv';
import { getToolsForUser } from './src/agent/tools';

dotenv.config();

async function checkToolOutput() {
    // Simulate Dr. Smith (user known to have access)
    // We need to find his ID first, but assuming typical seed:
    // User ID 2 is usually Dr. Smith.
    const mockUser = { role: 'doctor', userId: 2, doctorId: 1 };
    const tools = getToolsForUser(mockUser);

    // Find get_patient_medical_profile tool
    const tool = tools.find(t => t.name === 'get_patient_medical_profile');
    if (!tool) {
        console.error('Tool not found');
        return;
    }

    // Call it for Patient 1 (Ahmed Khan)
    console.log('Calling tool for Patient ID 1...');
    try {
        const result = await tool.invoke({ patient_id: 1 });
        console.log('--- Tool Output ---');
        // Parse the JSON string result
        const data = JSON.parse(result);
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Tool error:', e);
    }
}

checkToolOutput();
