# HMS Bot: Architecture, Goals & Execution Plan

**Role:** Senior AI RAG Full-Stack Engineer  
**Scope:** Backend only (Node.js, Express, PostgreSQL, Chroma). Chatbot that answers from hospital knowledge (RAG) and performs appointment CRUD via natural language (agent + tools). Three user types: **Patient**, **Doctor**, **Admin** (logged in); permissions and tools vary by role.

---

## 0. User Types & Role-Based Access

### Three User Types (Logged In)

| Role        | Who               | Capabilities                                                                                                                                                       |
| ----------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Patient** | Logged-in patient | Book appointment (for self), update/cancel own appointments, ask for doctors, departments, OPD hours, other hospital info (RAG).                                   |
| **Doctor**  | Logged-in doctor  | View **their** booked appointments, patient details for each appointment (name, contact, time, etc.). No booking; RAG for hospital info.                           |
| **Admin**   | Logged-in admin   | Everything: book appointment (for any patient), update/cancel any appointment, view all appointments, full hospital details (doctors, patients, schedules, stats). |

### Permission Summary

| Action / Data                               | Patient        | Doctor                     | Admin            |
| ------------------------------------------- | -------------- | -------------------------- | ---------------- |
| Search knowledge (RAG)                      | ✅             | ✅                         | ✅               |
| Get doctors / departments / schedules       | ✅             | ✅                         | ✅               |
| Get available slots                         | ✅             | ❌                         | ✅               |
| **Book** appointment                        | ✅ (self only) | ❌                         | ✅ (any patient) |
| **Update** appointment                      | ✅ (own only)  | ❌                         | ✅ (any)         |
| **Cancel** appointment                      | ✅ (own only)  | ❌                         | ✅ (any)         |
| List **my** appointments                    | ✅             | —                          | —                |
| List **my** booked appointments (as doctor) | —              | ✅                         | —                |
| List **all** appointments / hospital stats  | ❌             | ❌                         | ✅               |
| View patient details for an appointment     | ❌             | ✅ (own appointments only) | ✅ (all)         |

### Identity Resolution by Role

- **Patient (logged in):** `patient_id` comes from auth (e.g. `users.patient_id` or JWT). Book/update/cancel/list are scoped to this `patient_id`; no need to ask “which patient?”
- **Doctor (logged in):** `doctor_id` comes from auth. “My appointments” = appointments where `doctor_id` = logged-in doctor. Patient details returned only for those appointments.
- **Admin:** No automatic scope. Can book for any patient (agent or API must receive `patient_id` or resolve via phone/name). Can list and manage all appointments and see full hospital data.

### Auth & API

- **Auth:** Login (e.g. `POST /auth/login`) returns a token (JWT) containing `user_id`, `role` (`patient` | `doctor` | `admin`), and optionally `patient_id` or `doctor_id` for convenience.
- **Chat:** `POST /chat` requires auth (Bearer token). Backend reads `role` + `patient_id`/`doctor_id` from token and passes them to the agent so it only exposes allowed tools and scopes data correctly.
- **Users table:** Either a single `users` table (`id`, `email`, `password_hash`, `role`, `patient_id?`, `doctor_id?`) linked to `patients` and `doctors`, or separate auth records per role; recommended: one `users` table with `role` + foreign keys to `patients` / `doctors` where applicable.

---

## 1. Evaluation of the Solution

### What We’re Building

| Layer          | Responsibility                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| **PostgreSQL** | Source of truth: hospital, departments, doctors, patients, schedules, **appointments**.                               |
| **Chroma**     | Vector store for RAG: embeddings of text chunks derived from hospital/doctor/schedule data (or original doc).         |
| **RAG**        | Retrieve relevant chunks for user question → inject into LLM context → grounded answers.                              |
| **Agent**      | Orchestrates: “Is this a knowledge question or an action (book/update/cancel)?” → calls RAG or tools.                 |
| **Tools**      | Postgres-backed: get doctors, get schedule, get available slots, create/update/cancel appointment, list appointments. |
| **Express**    | Single entry: `POST /chat` (and optional `POST /ingest`). Stream response for UX.                                     |

### Why This Split

- **RAG (Chroma)** answers “Who is Dr. Smith?”, “What departments exist?”, “What are OPD hours for cardiology?” from **static/semi-static** knowledge. No live availability here.
- **Tools (Postgres)** handle **live state**: “Is Dr. Smith free on Feb 5?”, “Book me at 9 AM”, “Cancel my Feb 5 appointment.” Any create/update/delete **must** go through tools so we never hallucinate bookings.

### Risks Identified

| Risk                                 | Mitigation                                                                                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent hallucinates slots or bookings | All availability and CRUD go through tools that query/update Postgres only.                                                                                                                                                     |
| Double booking                       | Unique constraint or check: `(doctor_id, scheduled_date, slot_start)` (or slot_id) must be unique in `appointments`.                                                                                                            |
| “Book for me” but unknown patient    | Require patient resolution: auth/session with `patient_id`, or user provides phone/name and we resolve via `get_patient_by_phone` / `get_patient_by_name`; agent can ask “May I have your phone number to look up your record?” |
| Stale RAG vs DB                      | Chunks in Chroma built from same data as Postgres (doc or DB-generated text). Optional sync job when doctors/schedules change.                                                                                                  |
| Slot granularity                     | Schedules store OPD windows (e.g. 6–12, 12–6). We define bookable slots (e.g. 30 min) within those windows; availability = schedule minus existing appointments.                                                                |

---

## 2. Re-Evaluation (Second Pass)

### Data Flow (Clarified)

1. **Ingest (one-time or on change)**

   - Postgres is populated from the provided document (hospital, departments, doctors, patients, schedules).
   - Chunks are built from that data (e.g. “Dr. John Smith, Cardiology, Senior Consultant, OPD Feb 2: 6AM–12PM …”) or from the raw doc.
   - Chunks are embedded and stored in Chroma.
   - Result: Postgres = source of truth; Chroma = searchable representation for RAG.

2. **Chat (every request)**

   - Request is **authenticated** (Bearer token). Backend resolves `role` (patient | doctor | admin) and `patient_id` or `doctor_id` from token.
   - User message → Agent (LLM with **role-filtered tools**). Only tools allowed for that role are exposed (see §0 and Tool Design table).
   - Agent may call `search_knowledge(query)` → retriever over Chroma → returns chunk text (for “what/who” questions).
   - Agent may call Postgres tools: for **Patient** → get_doctors, get_doctor_schedule, get_available_slots, create_appointment (self), update/cancel (own), list_my_appointments; for **Doctor** → get_doctors, get_doctor_schedule, list_doctor_appointments (with patient details); for **Admin** → all tools including list_all_appointments, get_hospital_overview, get_patient_by_phone/name.
   - Patient/doctor identity: from token (`patient_id` / `doctor_id`). Admin can specify any patient when booking.
   - Agent returns final reply (optionally streamed).

3. **Appointment lifecycle**
   - **Create:** Resolve patient → get available slots for doctor+date → user (or agent) picks slot → `create_appointment` → return confirmation.
   - **Update:** Resolve appointment (by confirmation code or patient+date) → check new slot free → `update_appointment` → confirm.
   - **Cancel:** Resolve appointment → `cancel_appointment` (soft delete: `status = 'cancelled'`) → confirm.

### Tool Design (Concrete)

Tools are **filtered by role** at runtime: the agent receives only the tools allowed for the current user’s role (see §0). Admin gets all tools; Patient and Doctor get a subset.

| Tool                       | Input                                           | Output                                                          | Postgres      | Allowed roles                       |
| -------------------------- | ----------------------------------------------- | --------------------------------------------------------------- | ------------- | ----------------------------------- |
| `search_knowledge`         | `query: string`                                 | Text chunks from Chroma                                         | No            | Patient, Doctor, Admin              |
| `get_doctors`              | `department?: string`                           | List of doctors (id, name, department, code)                    | SELECT        | Patient, Doctor, Admin              |
| `get_doctor_schedule`      | `doctor_id`, `from_date`, `to_date`             | OPD windows from `schedules`                                    | SELECT        | Patient, Doctor, Admin              |
| `get_available_slots`      | `doctor_id`, `date`                             | Slots within OPD windows not in `appointments`                  | SELECT        | Patient, Admin                      |
| `create_appointment`       | `patient_id`, `doctor_id`, `date`, `slot_start` | Appointment + confirmation_code                                 | INSERT        | Patient (self), Admin (any)         |
| `update_appointment`       | `appointment_id`, `new_date`, `new_slot_start`  | Updated appointment                                             | UPDATE        | Patient (own), Admin (any)          |
| `cancel_appointment`       | `appointment_id` (or patient_id + date)         | Success                                                         | UPDATE status | Patient (own), Admin (any)          |
| `list_my_appointments`     | `patient_id`, `from_date?`, `to_date?`          | List of appointments for this patient                           | SELECT        | Patient, Admin                      |
| `list_doctor_appointments` | `doctor_id`, `from_date?`, `to_date?`           | List of appointments for this doctor + patient details per slot | SELECT        | Doctor, Admin                       |
| `list_all_appointments`    | `from_date?`, `to_date?`, `doctor_id?`          | All appointments (optionally filtered)                          | SELECT        | Admin only                          |
| `get_hospital_overview`    | —                                               | High-level stats (doctors, patients, appointments count, etc.)  | SELECT        | Admin only                          |
| `get_patient_by_phone`     | `phone: string`                                 | Patient id + name                                               | SELECT        | Admin (for booking for any patient) |
| `get_patient_by_name`      | `first_name`, `last_name`                       | Patient id + name                                               | SELECT        | Admin                               |

- **Patient:** When calling `create_appointment` / `update_appointment` / `cancel_appointment` / `list_my_appointments`, backend injects `patient_id` from token; agent must not allow overriding to another patient.
- **Doctor:** Only gets `list_doctor_appointments` (and RAG/knowledge tools); `doctor_id` from token. Response includes patient details (name, contact, time) for each appointment.
- **Admin:** Gets all tools; can pass any `patient_id` or `doctor_id` where applicable.

Slot granularity (e.g. 30 min) is a backend constant or config; `get_available_slots` computes slots from `schedules` minus `appointments`.

---

## 3. Clear Goals (Definition of Done)

| ID     | Goal                      | Success Criteria                                                                                                                                                                                                                                                                        |
| ------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G1** | **Knowledge answering**   | User asks “Who is Dr. John Smith?” / “What are the cardiology OPD hours?” → answer is grounded in RAG chunks (Chroma), no hallucination of facts.                                                                                                                                       |
| **G2** | **Book appointment**      | User says “Book me with Dr. Smith on Feb 5 morning” (and identifies self or we resolve patient) → one new row in `appointments`, agent confirms with doctor, date, time, confirmation code.                                                                                             |
| **G3** | **Update appointment**    | User says “Move my Feb 5 appointment to Feb 6 afternoon” → existing appointment row updated; agent confirms new date/time.                                                                                                                                                              |
| **G4** | **Cancel appointment**    | User says “Cancel my appointment on Feb 5” → appointment `status = 'cancelled'` (or deleted); agent confirms cancellation.                                                                                                                                                              |
| **G5** | **Agentic orchestration** | One chat endpoint: agent chooses RAG vs tools; multi-turn works (e.g. “I need a cardiologist” → “Dr. Smith” → “Book me with him on Feb 5”).                                                                                                                                             |
| **G6** | **Data model**            | Postgres schema: hospitals, departments, doctors, patients, schedules, appointments, **users** (auth + role + patient_id/doctor_id). Chroma collection populated from same data (or doc). No double booking (enforced by DB or checks).                                                 |
| **G7** | **Role-based access**     | **Patient** (logged in): book/update/cancel own appointments, ask doctors/info. **Doctor** (logged in): view their booked appointments and patient details per slot. **Admin**: book for any patient, view/edit all appointments, full hospital details. Tools and data scoped by role. |

---

## 4. How We Achieve It (Execution Plan)

### Phase 1: Data & Schema

1. **Postgres schema**

   - Tables: `hospitals`, `departments`, `doctors`, `patients`, `schedules`, `appointments`, **`users`** (auth).
   - `appointments`: `id`, `patient_id`, `doctor_id`, `scheduled_date`, `slot_start`, `slot_end`, `status` (e.g. `scheduled | completed | cancelled | no_show`), `confirmation_code` (unique), `created_at`, `updated_at`.
   - **`users`**: `id`, `email`, `password_hash`, `role` (`patient` | `doctor` | `admin`), `patient_id` (FK nullable), `doctor_id` (FK nullable), `created_at`. One user row per login; Patient links to `patients`, Doctor to `doctors`, Admin has both FKs null.
   - Uniqueness: e.g. unique on `(doctor_id, scheduled_date, slot_start)` for booked slots (or equivalent) to prevent double booking.

2. **Seed**

   - Parse the provided hospital document (or CSV/JSON) → insert into Postgres.
   - Define bookable slot duration (e.g. 30 min) and rules (slots only within OPD windows in `schedules`).

3. **Chroma ingest**
   - Build text chunks from Postgres (or from doc): e.g. per-doctor summary (name, department, OPD hours for next N days), per-department list, hospital info.
   - Embed (OpenAI `text-embedding-3-small` or equivalent) → add to Chroma collection `hospital_knowledge`.

### Phase 2: RAG Pipeline

1. **Retriever**

   - Embed user query → Chroma similarity search → top-k chunks (e.g. k=5).
   - Expose as LangChain retriever or as a **tool** `search_knowledge(query)` that returns chunk text to the agent.

2. **Integration with agent**
   - Option A: Pre-call retriever for every message and inject chunks into system message.
   - Option B (preferred): Agent has tool `search_knowledge`; it calls when it needs “what/who” knowledge; Postgres tools for “when/book/cancel”.
   - Option B keeps tool usage explicit and avoids unnecessary retrieval for pure booking flows.

### Phase 3: Agent & Tools

1. **LLM**

   - OpenAI (e.g. GPT-4o) with function/tool calling (or Anthropic equivalent).
   - System prompt: you are Abbasi Hospital’s assistant; you can search knowledge (RAG) and book/update/cancel appointments via tools; always confirm actions with clear summary.

2. **Tools implementation**

   - Each tool above implemented as a function that uses Postgres (e.g. `pg` or Prisma).
   - **Role-based tool set:** At chat request time, build the tool list from the allowed set for `role` (see §0 and Tool Design table). Patient gets patient tools only; Doctor gets doctor tools only; Admin gets all tools.
   - **Scope enforcement inside tools:** For Patient: `create_appointment` / `update_appointment` / `cancel_appointment` / `list_my_appointments` receive `patient_id` from auth and must not accept a different patient_id. For Doctor: `list_doctor_appointments` receives `doctor_id` from auth and returns only that doctor’s appointments with patient details. For Admin: tools accept any `patient_id` / `doctor_id` as arguments.
   - `create_appointment`: validate doctor, date, slot within schedule and not already booked; generate `confirmation_code`; insert; return confirmation.
   - `update_appointment`: validate appointment exists and new slot is free; for Patient, validate appointment belongs to this patient; update row.
   - `cancel_appointment`: set `status = 'cancelled'` (or delete); for Patient, validate appointment belongs to this patient; idempotent if already cancelled.

3. **Patient / doctor resolution**

   - **Patient (logged in):** `patient_id` always from auth; no need to ask “which patient?” for book/update/cancel/list.
   - **Doctor (logged in):** `doctor_id` from auth; “my appointments” = appointments for this doctor.
   - **Admin:** Can book for any patient; agent or API can receive `patient_id` or resolve via `get_patient_by_phone` / `get_patient_by_name` when user says “book for Ahmed Khan.”

4. **Agent loop**
   - Use LangChain.js `createReactAgent` (or LangGraph.js): user message + optional conversation history → LLM → if tool_calls → execute tools → append tool results → LLM again → repeat until final reply.
   - Return final reply (and optionally stream tokens).

### Phase 4: API & Auth

1. **Auth**

   - `POST /auth/login`: body `{ email, password }` → validate against `users` → return JWT with `user_id`, `role`, `patient_id?`, `doctor_id?`.
   - Optional: `POST /auth/register` (e.g. for patients only, or admin-only user creation).
   - Auth middleware: verify JWT on protected routes; attach `req.user` = `{ user_id, role, patient_id?, doctor_id? }`.

2. **Express**

   - `POST /chat`: **requires auth** (Bearer token). Body `{ message, conversation_id? }`. No `patient_id` in body for Patient/Doctor — taken from token. Admin may pass `patient_id?` in body when booking for another patient.
   - Backend passes `role` + `patient_id`/`doctor_id` from `req.user` to the agent so it uses role-filtered tools and scopes create/update/cancel/list correctly.
   - Response: stream (SSE or chunked) with assistant message; optional `tool_calls` in payload for debugging.
   - Optional: `POST /ingest` to re-run Chroma ingest (e.g. admin-only or internal).

3. **Config**
   - Env: `DATABASE_URL`, `OPENAI_API_KEY`, `CHROMA_URL` (or local Chroma), `JWT_SECRET`.
   - Slot duration and booking rules in config.

### Phase 5: Validation & Safety

- **Create:** Validate doctor exists, date is valid, slot in schedule, slot not already booked; return clear error to agent. For Patient, enforce `patient_id` from auth only.
- **Update/Cancel:** Validate appointment exists. For **Patient**, enforce that `appointment.patient_id` equals authenticated `patient_id`; for Admin, allow any. Return 403/clear error if not allowed.
- **List appointments:** Patient sees only own; Doctor sees only own (with patient details); Admin sees all.
- **Idempotent cancel:** Cancelling an already-cancelled appointment is success.
- **No PII in logs:** Avoid logging full patient identifiers in production; log only ids or confirmation codes where needed.

### Phase 6: Testing (Recommended)

- **Unit:** Tools in isolation with mock DB (e.g. create_appointment returns confirmation, get_available_slots returns only free slots).
- **Integration:** Postgres + Chroma + agent: “Book appointment for patient X with Dr. Smith on Feb 5” → one row in `appointments`; “Cancel that appointment” → status updated.
- **E2E:** Script or Postman: send messages; assert response contains expected confirmation and DB state matches.

---

## 5. Summary

- **PostgreSQL** = single source of truth for hospital, doctors, patients, schedules, appointments, and **users** (auth + role + patient_id/doctor_id).
- **Chroma** = RAG over text chunks derived from that data (or the original doc).
- **Agent** = one entry point; decides between RAG (`search_knowledge`) and Postgres tools (availability + appointment CRUD). **Tools and data are filtered by role** (Patient / Doctor / Admin).
- **User types:** **Patient** (logged in) → book/update/cancel own appointments, ask doctors/info. **Doctor** (logged in) → view their booked appointments and patient details per slot. **Admin** → book for any patient, view/edit all appointments, full hospital details.
- **Goals** = G1–G7: knowledge answers, book/update/cancel appointments, agentic multi-turn, correct data model, no double booking, clear patient resolution, **role-based access**.
- **Achievement** = Phase 1 (schema + seed + Chroma + users) → Phase 2 (RAG) → Phase 3 (agent + role-filtered tools) → Phase 4 (Express API + auth) → Phase 5 (validation + scope checks) → Phase 6 (tests).

Docker is optional: one container for the Node app, optional containers for Postgres and Chroma (e.g. `docker-compose`), with env-based config.
