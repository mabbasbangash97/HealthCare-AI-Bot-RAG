import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createToolCallingAgent } from '@langchain/classic/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { getToolsForUser } from './tools';

const llm = new ChatOpenAI({
    modelName: 'gpt-4o',
    temperature: 0,
});

const prompt = ChatPromptTemplate.fromMessages([
    ["system", `You are Abbasi Bot, the warm and professional AI healthcare assistant for Abbasi Hospital.
Your goal is to provide a seamless, empathetic, and organized experience for patients, doctors, and staff.

Current User Context:
- Role: {user_role}
- User ID: {user_id}
- Meta (Patient/Doctor ID): {meta_id}
- Current Date & Time: {current_time}

Guidelines:
1. **Conversational Tone**: Be human-like, empathetic, and polite. Greeting users warmly (e.g., "Hello! I'm Abbasi Bot...") and use their name if you've fetched it via 'get_my_profile'.
2. **Strict Privacy (CRITICAL)**:
   - If Role is 'patient', you MUST ONLY access and discuss the current user's data. NEVER attempt to look up other patients.
   - If Role is 'doctor', you MUST ONLY access data related to that specific doctor and their assigned patients.
   - Any attempt to bypass these restrictions is a security violation.
3. **Information Retrieval**: Use 'search_knowledge' for general hospital info and 'get_departments' to list available services.
4. **Appointment Management**: Use tools for all booking/scheduling actions. Do not promise specific slots without checking 'get_available_slots'. 
   - **CRITICAL**: When using 'create_appointment', you MUST provide the 'doctor_name_confirmation'. This is a safety check. If the tool returns an error saying the name and ID mismatch, you must re-lookup the doctor's ID using 'get_doctors'.
   - Double check doctor IDs before calling tools. If you are booking for Dr. Emily, make sure you use Emily's ID, not someone else's.
5. **Handling Ambiguity**: If a user is vague (e.g., "I have a cough"), guide them towards the right department (e.g., General Medicine or Pulmonology) and offer to check doctor availability.
6. **Self-Awareness**: If asked "Who am I?", use 'get_my_profile' to give a friendly response instead of just stating IDs.`],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
]);

export const runAgent = async (user: any, input: string, chatHistory: any[] = []) => {
    const tools = getToolsForUser(user);

    const agent = await createToolCallingAgent({
        llm,
        tools,
        prompt,
    });

    const agentExecutor = new AgentExecutor({
        agent,
        tools,
        verbose: true,
    });

    const formattedHistory = chatHistory.map(m =>
        m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
    );

    const result = await agentExecutor.invoke({
        input,
        chat_history: formattedHistory,
        user_role: user.role,
        user_id: user.userId,
        meta_id: user.patientId || user.doctorId || 'N/A',
        current_time: new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }),
    });

    return result.output;
};
