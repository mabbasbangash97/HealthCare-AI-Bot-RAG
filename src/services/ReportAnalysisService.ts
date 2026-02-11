import fs from 'fs';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage } from '@langchain/core/messages';
// @ts-ignore
const pdfParse = require('pdf-parse');

/**
 * Service to analyze medical reports (PDF/Images) using Gemini Vision and pdf-parse.
 */
export class ReportAnalysisService {
    private static llm = new ChatGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY,
        model: 'gemini-2.5-pro',
        temperature: 0,
    });

    /**
     * Analyzes a report file and returns a structured summary.
     */
    static async analyzeFile(filePath: string, mimeType: string): Promise<string> {
        try {
            let contentParts: any[] = [];

            if (mimeType === 'application/pdf') {
                const buffer = fs.readFileSync(filePath);

                // 1. Extract Text
                let text = '';
                try {
                    const data = await pdfParse(buffer);
                    text = data.text.trim();
                } catch (e) {
                    console.warn('PDF Parsing failed:', e);
                }

                if (text.length > 50) {
                    contentParts.push({
                        type: 'text',
                        text: `This is a digital medical report PDF. Text content:\n\n${text}`
                    });
                } else {
                    // 2. Logic for Scanned PDF
                    return "Analysis Note: This PDF appears to be a scanned document or an image-based report. " +
                        "Currently, I can only analyze digital text from PDFs. For reports containing medical imaging or handwriting, " +
                        "please upload a clear photo (JPG/PNG) of the report.";
                }
            } else if (mimeType.startsWith('image/')) {
                const buffer = fs.readFileSync(filePath);
                const base64 = buffer.toString('base64');
                contentParts.push({
                    type: 'text',
                    text: 'Analyze this medical report image. Extract diagnosis, medications, and any visible vitals or lab results.'
                });
                contentParts.push({
                    type: 'image_url',
                    image_url: { url: `data:${mimeType};base64,${base64}` }
                });
            } else {
                return "Unsupported file type for analysis.";
            }

            if (contentParts.length === 0) return "Unable to read report content.";

            // 3. Call LLM
            const response = await this.llm.invoke([
                new HumanMessage({
                    content: [
                        ...contentParts,
                        {
                            type: 'text',
                            text: "\n\nProvide a concise medical summary in Markdown format:\n" +
                                "1. **Primary Diagnosis/Condition**\n" +
                                "2. **Medications/Treatment Plan**\n" +
                                "3. **Vital Signs/Key Metrics** (if found)\n" +
                                "4. **Action Items/Next Steps** (if identified)\n\n" +
                                "If no clear data is found for a section, state 'Not Mentioned'."
                        }
                    ]
                })
            ]);

            return response.content.toString();

        } catch (error) {
            console.error('Report Analysis Error:', error);
            return "Failed to analyze report: " + (error instanceof Error ? error.message : String(error));
        }
    }
}
