import { getToolsForUser } from '../src/agent/tools';
import dotenv from 'dotenv';

dotenv.config();

async function testRag() {
    console.log('Testing RAG search...');
    const user = { role: 'admin' };
    const tools = getToolsForUser(user);
    const searchTool = tools.find(t => t.name === 'search_knowledge');

    if (!searchTool) {
        console.error('search_knowledge tool not found!');
        return;
    }

    try {
        const query = 'Who is Dr. John Smith?';
        console.log(`Query: ${query}`);
        const result = await searchTool.invoke({ query });
        console.log('Result:\n', result);

        const query2 = 'What is the cardiology schedule?';
        console.log(`\nQuery: ${query2}`);
        const result2 = await searchTool.invoke({ query: query2 });
        console.log('Result:\n', result2);
    } catch (err) {
        console.error('Test Failed:', err);
    }
}

testRag();
