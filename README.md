# HealthCare AI Bot (HMS Bot)

An AI-powered chatbot designed for Healthcare Management Systems (HMS). This bot uses RAG (Retrieval-Augmented Generation) to provide accurate information based on medical documents and database records.

## Features

- **AI Chatbot**: Intelligent responses using OpenAI LangChain.
- **RAG Integration**: Retrieves relevant context from vector databases (ChromaDB).
- **Database Support**: Integration with PostgreSQL for structured healthcare data.
- **Role-Based Access**: Secure endpoints for doctor and patient interactions.
- **Document Ingestion**: Seamlessly ingest medical knowledge into the AI system.

## Tech Stack

- **Backend**: Node.js, Express, TypeScript
- **AI/LLM**: LangChain, OpenAI
- **Database**: PostgreSQL (pg), ChromaDB (Vector Store)
- **Development**: Nodemon, ts-node

## Getting Started

### Prerequisites

- Node.js (v18+)
- PostgreSQL
- OpenAI API Key

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/mabbasbangash97/HealthCare-AI-Bot-RAG.git
   cd hms-bot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   Create a `.env` file in the root directory and add:
   ```env
   OPENAI_API_KEY=your_openai_key
   DATABASE_URL=postgresql://user:password@localhost:5432/hms_db
   PORT=3000
   JWT_SECRET=your_jwt_secret
   ```

### Running the Application

- **Development Mode**:
  ```bash
  npm run dev
  ```

- **Seed Database**:
  ```bash
  npm run db:seed
  ```

- **Ingest Documents**:
  ```bash
  npm run db:ingest
  ```

## API Endpoints

- `POST /auth/register`: Register a new user.
- `POST /auth/login`: Login and receive a JWT.
- `POST /chat`: Interact with the AI bot.

## License

This project is licensed under the ISC License.
