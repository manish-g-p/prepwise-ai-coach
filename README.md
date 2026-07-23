# AI Interview Preparation Platform

A full-stack MERN application that turns a résumé and a job description into a
personalised interview strategy — likely questions with model answers, a skill
gap analysis, a day-by-day preparation plan with real learning resources, an
ATS-friendly tailored résumé, and an interactive mock interview that scores your
answers.

**Stack:** React (Vite) · Node.js · Express · MongoDB · Google Gemini · Docker

**[▶ Live demo](https://prepwise-ai-coach.vercel.app)** — frontend on Vercel, API on Render, database on MongoDB Atlas.

> The API runs on Render's free tier, which sleeps after ~15 minutes of
> inactivity. The first request after idle takes 30–60s to wake the service;
> subsequent requests are fast.

---

## Features

| Feature | What it does |
|---|---|
| **Résumé analysis** | Parses an uploaded PDF and scores how well it matches a job description |
| **Interview report** | Technical + behavioural questions, each with the interviewer's *intent* and how to answer |
| **Skill gap analysis** | Identifies missing skills and grades them low / medium / high severity |
| **Preparation plan** | A day-wise study plan tailored to the role |
| **Learning resources** | Real, curated GitHub repos, YouTube channels and roadmaps for the specific tech stack |
| **Live streaming** | The report renders progressively as the model generates it, over Server-Sent Events |
| **Mock interview** | The AI asks questions, you answer, and it scores you with strengths, gaps and a model answer |
| **Tailored résumé** | Generates an ATS-friendly résumé as a downloadable PDF |

---

## Engineering highlights

These are the parts that make it more than a wrapper around an API call.

**Schema-constrained generation.** Every AI response is forced into a strict
JSON shape by converting a Zod schema to JSON Schema and passing it as the
model's `responseSchema`. The model cannot return prose where the app expects a
number, so the frontend never defends against malformed AI output.

**Streaming with a custom partial-JSON parser.** The report is a single large
JSON object, so naive streaming would show the user raw braces. The backend
streams model output over SSE and the frontend runs a purpose-built
best-effort parser (`parsePartialJson`) that closes unbalanced structures and
discards half-written elements, letting whole sections appear the moment they
are complete.

**RAG over a self-growing question bank.** Generated questions are embedded
(768-dim, reduced from 3072 to cut storage 4×) and stored in MongoDB. New
generations retrieve semantically similar questions by cosine similarity and
feed them to the model as grounding, so the corpus improves as the app is used
— with no paid vector database.

**Resilience against a flaky upstream.** AI calls run through a retry helper
with exponential backoff and jitter. Transient failures (503 overload, network
blips, malformed JSON) are retried; daily quota exhaustion is detected and
fails fast instead of burning time on a request that cannot succeed.

**Response caching.** Identical inputs are hashed and served from a MongoDB TTL
collection, which cuts repeat latency from ~30s to ~0s and protects a limited
free-tier API quota. MongoDB's TTL index expires entries automatically, so no
separate cache service is needed.

**LLM-as-judge evaluation.** Mock interview answers are graded against the
question's intent with a strict rubric. Evaluations are honest — an empty or
throwaway answer scores near zero with no invented strengths.

---

## Architecture

```
Frontend (React + Vite)
   │  axios + fetch/ReadableStream (SSE)
   ▼
Backend (Express)
   ├── auth        JWT in an httpOnly cookie, bcrypt hashing, token blacklist
   ├── interview   PDF parse → RAG retrieval → AI generation → cache → persist
   ├── mock        session state machine + answer evaluation
   └── services    ai · embedding · rag
   │
   ├──▶ MongoDB Atlas   reports · users · question bank (vectors) · TTL cache
   └──▶ Google Gemini   generation · embeddings
```

---

## Getting started

**Prerequisites:** Node.js 20+, a free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
cluster, and a free [Google AI Studio](https://aistudio.google.com/apikey) API key.

```bash
# 1. Configure the backend
cd Backend
cp .env.example .env      # then fill in MONGO_URI, GOOGLE_GENAI_API_KEY, JWT_SECRET
npm install
npm run dev               # http://localhost:3000

# 2. In a second terminal, start the frontend
cd Frontend
npm install
npm run dev               # http://localhost:5173
```

### With Docker

```bash
docker compose up --build
```

Frontend on http://localhost:8080, backend on http://localhost:3000.

---

## Deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for a step-by-step guide to deploying the
API to Render and the frontend to Vercel, both on free tiers, plus how to keep
Docker's data off your system drive.

---

## API

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create an account |
| `POST` | `/api/auth/login` | Log in |
| `GET` | `/api/auth/logout` | Log out (blacklists the token) |
| `GET` | `/api/auth/get-me` | Current user |
| `POST` | `/api/interview/` | Generate a report |
| `POST` | `/api/interview/stream` | Generate a report, streamed over SSE |
| `GET` | `/api/interview/` | List the user's reports |
| `GET` | `/api/interview/report/:id` | Fetch one report |
| `POST` | `/api/interview/resume/pdf/:id` | Download a tailored résumé PDF |
| `POST` | `/api/mock/start/:reportId` | Start a mock interview |
| `POST` | `/api/mock/:sessionId/answer` | Submit an answer and get it scored |
| `GET` | `/api/mock/:sessionId` | Fetch a mock session |
| `GET` | `/health` | Health check |

All `/api/interview` and `/api/mock` routes require authentication and are
scoped to the requesting user.
