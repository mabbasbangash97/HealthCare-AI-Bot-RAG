import { getToolsForUser } from './src/agent/tools';
import { ReportService } from './src/services/ReportService';
import { UserService } from './src/services/UserService';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    try {
        console.log('--- Verifying Report Listing in Tool ---');

        const doctorId = 1; // Dr. John Smith
        const patientId = 1; // Ahmed Khan

        // 1. Ensure Relationship Exists (Dr 1 -> Pat 1)
        // (We know it does from previous tests, but let's be safe or just assume)

        // 2. Create a Dummy Report
        console.log('Creating dummy report...');
        const uniqueName = `report-${Date.now()}.pdf`;
        await ReportService.createReport(
            patientId,
            doctorId,
            uniqueName,
            '/uploads/dummy.pdf',
            'Lab Report',
            'Blood Test Results'
        );
        console.log('Report created.');

        // 3. Invoke Tool
        const user = { role: 'doctor', doctorId: doctorId, userId: 2 }; // userId 2 is Dr. Smith in seed? Need to check.
        // Actually userId is needed for logs but tool logic uses user.doctorId directly.

        const tools = getToolsForUser(user);
        const tool = tools.find(t => t.name === 'get_patient_medical_profile');

        if (!tool) throw new Error('Tool not found');

        console.log('Invoking get_patient_medical_profile...');
        const resultJson = await tool.invoke({ patient_id: patientId });
        const result = JSON.parse(resultJson);

        console.log('Tool Output:', JSON.stringify(result, null, 2));

        // 4. Verification
        if (result.uploaded_reports && result.uploaded_reports.length > 0) {
            const found = result.uploaded_reports.find((r: any) => r.file_name === uniqueName);
            if (found) {
                console.log('✅ SUCCESS: Created report found in tool output!');
            } else {
                console.error('❌ FAILURE: Report list present but specific report not found.');
            }
        } else {
            console.error('❌ FAILURE: No uploaded_reports field or empty list.');
        }

    } catch (err) {
        console.error('Test Failed:', err);
    }
}

run();
