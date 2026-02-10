
import { ReportAnalysisService } from './src/services/ReportAnalysisService';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

async function test() {
    console.log("--- Testing Report Analysis Service ---");

    // Test with a real image from uploads
    const realImgPath = path.join(__dirname, 'uploads', '1770232240473-333778585.png');
    if (fs.existsSync(realImgPath)) {
        console.log(`Testing with real image: ${realImgPath}`);
        try {
            const result = await ReportAnalysisService.analyzeFile(realImgPath, 'image/png');
            console.log("Analysis Result for Image:\n", result);
        } catch (e) {
            console.error("Analysis Error:", e);
        }
    } else {
        console.log("Real image not found, skipping vision test.");
    }

    console.log("--- Test Complete ---");
}

test();
