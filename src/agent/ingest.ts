import { Client } from 'pg';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from '@langchain/core/documents';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function ingest() {
    try {
        await client.connect();
        console.log('Connected to database for ingestion.');

        // 1. Fetch data
        const doctorsRes = await client.query('SELECT d.name, d.bio, dep.name as department FROM doctors d JOIN departments dep ON d.department_id = dep.id');
        const hospitalRes = await client.query('SELECT * FROM hospitals');
        const schedulesRes = await client.query(`
            SELECT d.name as doctor_name, s.day_of_week, s.start_time, s.end_time 
            FROM schedules s 
            JOIN doctors d ON s.doctor_id = d.id
        `);

        const docs: Document[] = [];

        // 2. Process Doctors
        for (const dr of doctorsRes.rows) {
            const content = `${dr.name} is a doctor in the ${dr.department} department. Bio: ${dr.bio}`;
            docs.push(new Document({
                pageContent: content,
                metadata: { type: 'doctor', name: dr.name, department: dr.department }
            }));
        }

        // 3. Process Hospital
        for (const h of hospitalRes.rows) {
            const content = `${h.name} is located at ${h.address}. Contact: ${h.phone}`;
            docs.push(new Document({
                pageContent: content,
                metadata: { type: 'hospital', name: h.name }
            }));
        }

        // 4. Process Schedules
        for (const s of schedulesRes.rows) {
            const content = `${s.doctor_name} is available on ${s.day_of_week} from ${s.start_time} to ${s.end_time}.`;
            docs.push(new Document({
                pageContent: content,
                metadata: { type: 'schedule', doctor: s.doctor_name, day: s.day_of_week }
            }));
        }

        console.log(`Prepared ${docs.length} documents for ingestion.`);

        // 5. Store in Chroma
        const embeddings = new OpenAIEmbeddings();
        await Chroma.fromDocuments(docs, embeddings, {
            collectionName: 'hospital_knowledge',
            url: process.env.CHROMA_URL,
        });

        console.log('Ingestion completed successfully.');
    } catch (err) {
        console.error('Error during ingestion:', err);
    } finally {
        await client.end();
    }
}

ingest();
