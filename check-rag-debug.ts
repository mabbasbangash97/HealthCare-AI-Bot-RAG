import { Chroma } from '@langchain/community/vectorstores/chroma';
import { OpenAIEmbeddings } from '@langchain/openai';
import dotenv from 'dotenv';

dotenv.config();

async function checkRag() {
    try {
        const embeddings = new OpenAIEmbeddings();
        const vectorStore = await Chroma.fromExistingCollection(embeddings, {
            collectionName: 'hospital_knowledge',
            url: process.env.CHROMA_URL,
        });

        const query = 'Dr. Emily Brown';
        console.log(`Searching for: ${query}`);
        const results = await vectorStore.similaritySearch(query, 2);
        console.log('Results:', JSON.stringify(results, null, 2));
    } catch (err) {
        console.error('RAG Check Error:', err);
    }
}

checkRag();
