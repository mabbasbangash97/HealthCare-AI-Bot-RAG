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

        // 1. Fetch Rich Doctor Data
        const doctorsRes = await client.query(`
            SELECT d.*, dep.name as department_name 
            FROM doctors d 
            JOIN departments dep ON d.department_id = dep.id
        `);

        // 2. Fetch Hospital Data (now with location)
        const hospitalRes = await client.query('SELECT * FROM hospitals');

        const docs: Document[] = [];

        // 3. Process Doctors
        for (const dr of doctorsRes.rows) {
            // Construct a rich profile for semantic search
            // We want retrieval to work for queries like:
            // "Who specializes in heart issues?" -> Cardiology/Interventional Cardiology
            // "Is there a female doctor?" -> (Implicitly Dr. Sarah/Ayesha) - though we don't strictly have gender, names help
            // "Doctor with 10 years experience" -> experience field

            const bioPart = dr.bio ? `Bio: ${dr.bio}. ` : '';
            const specPart = dr.specialization ? `Specialization: ${dr.specialization}. ` : '';
            const subSpecPart = dr.sub_specialty ? `Sub-specialty: ${dr.sub_specialty}. ` : '';
            const qualPart = dr.qualifications ? `Qualifications: ${dr.qualifications}. ` : '';
            const expPart = dr.experience ? `Experience: ${dr.experience}. ` : '';
            const contactPart = dr.contact_info ? `Contact: ${dr.contact_info}. ` : '';
            const logicPart = `Designation: ${dr.designation}. Status: ${dr.status}. Doctor Code: ${dr.doctor_code}.`;

            const content = `Dr. ${dr.name} is a ${dr.designation} in the ${dr.department_name} department. 
            ${specPart}${subSpecPart}${qualPart}${expPart}${bioPart}
            ${logicPart}
            ${contactPart}`;

            docs.push(new Document({
                pageContent: content.replace(/\s+/g, ' ').trim(),
                metadata: {
                    type: 'doctor',
                    name: dr.name,
                    department: dr.department_name,
                    specialization: dr.specialization,
                    doctor_code: dr.doctor_code
                }
            }));
        }

        // 4. Process Hospital
        for (const h of hospitalRes.rows) {
            const content = `${h.name} is a hospital located at ${h.location}. Address: ${h.address}. Phone: ${h.phone}.`;
            docs.push(new Document({
                pageContent: content,
                metadata: { type: 'hospital', name: h.name }
            }));
        }

        console.log(`Prepared ${docs.length} documents for ingestion.`);

        // 5. Store in Chroma
        const embeddings = new OpenAIEmbeddings();

        // Note: For a clean update, usually we might want to delete existing collection, but Chroma.fromDocuments appends.
        // Given we changed schema significantly, appending old data might be bad.
        // However, standard library doesn't easily support "delete collection" via this static method without getting the collection first.
        // For this MVP update, we'll append/overwrite. In prod, we'd clear first.

        await Chroma.fromDocuments(docs, embeddings, {
            collectionName: 'hospital_knowledge_v2',
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
