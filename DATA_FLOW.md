# Smart Job Connect - Data Flow Documentation

This document provides detailed data flow diagrams and sequence diagrams for the key operations in the Smart Job Connect system.

## Table of Contents
1. [System Component Diagram](#system-component-diagram)
2. [User Authentication Flow](#user-authentication-flow)
3. [CV Upload and Parsing Flow](#cv-upload-and-parsing-flow)
4. [Job Creation and Indexing Flow](#job-creation-and-indexing-flow)
5. [Semantic Matching Flow](#semantic-matching-flow)
6. [AI Chatbot Query Flow](#ai-chatbot-query-flow)
7. [Real-time Search Flow](#real-time-search-flow)

---

## System Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLIENT TIER                                     │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                  React Frontend (Port 3001)                     │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │    │
│  │  │   Home   │  │   Jobs   │  │   CVs    │  │   Profile    │  │    │
│  │  │   Page   │  │   List   │  │   List   │  │  Management  │  │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────┘  │    │
│  │         │              │              │              │          │    │
│  │         └──────────────┴──────────────┴──────────────┘          │    │
│  │                            │                                     │    │
│  │                     ┌──────▼──────┐                            │    │
│  │                     │  API Client  │                            │    │
│  │                     │   (Axios)    │                            │    │
│  │                     └──────┬───────┘                            │    │
│  └────────────────────────────┼────────────────────────────────────┘    │
└─────────────────────────────────┼──────────────────────────────────────┘
                                  │ HTTPS/REST
                                  │ JWT Bearer Token
                                  │
┌─────────────────────────────────▼──────────────────────────────────────┐
│                         APPLICATION TIER                                │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │              NestJS Backend (Port 3000)                       │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │     │
│  │  │              │  │              │  │              │       │     │
│  │  │   Auth       │  │    CV        │  │    Job       │       │     │
│  │  │   Module     │  │   Module     │  │   Module     │       │     │
│  │  │              │  │              │  │              │       │     │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │     │
│  │         │                  │                  │               │     │
│  │  ┌──────▼──────────────────▼──────────────────▼──────┐      │     │
│  │  │                                                     │      │     │
│  │  │              RAG Service Module                    │      │     │
│  │  │  • Document Indexing                               │      │     │
│  │  │  • Embedding Generation                            │      │     │
│  │  │  • Semantic Search                                 │      │     │
│  │  │  • CV-Job Matching                                 │      │     │
│  │  │  • AI Chatbot                                      │      │     │
│  │  │                                                     │      │     │
│  │  └──────┬──────────────────────────┬──────────────────┘      │     │
│  └─────────┼──────────────────────────┼─────────────────────────┘     │
│            │                          │                                │
│            │ HTTP                     │ HTTP                           │
│            │                          │                                │
│  ┌─────────▼────────┐      ┌─────────▼──────────┐                    │
│  │                  │      │                     │                    │
│  │   FastAPI        │      │   OpenAI API        │                    │
│  │   (Port 8000)    │      │   (External)        │                    │
│  │                  │      │                     │                    │
│  │  • Resume Parser │      │  • GPT-4o-mini      │                    │
│  │  • Gemini AI     │      │  • text-embedding   │                    │
│  │  • OCR           │      │    -3-small         │                    │
│  │                  │      │                     │                    │
│  └──────────────────┘      └─────────────────────┘                    │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │
┌─────────────────────────────────▼──────────────────────────────────────┐
│                           DATA TIER                                     │
│  ┌────────────────────────────────────────────────────────────┐        │
│  │                MongoDB Database                             │        │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐           │        │
│  │  │   users    │  │    cvs     │  │    jobs    │           │        │
│  │  │            │  │            │  │            │           │        │
│  │  │ • _id      │  │ • _id      │  │ • _id      │           │        │
│  │  │ • email    │  │ • fullname │  │ • title    │           │        │
│  │  │ • password │  │ • skills   │  │ • skills   │           │        │
│  │  │ • role     │  │ • exp      │  │ • location │           │        │
│  │  └────────────┘  └────────────┘  └────────────┘           │        │
│  │                                                             │        │
│  │  ┌────────────────────────────────────────────┐           │        │
│  │  │           embeddings                        │           │        │
│  │  │                                             │           │        │
│  │  │  • sourceType: "cv" | "job"                │           │        │
│  │  │  • sourceId: ObjectId                      │           │        │
│  │  │  • chunkIndex: -1 (doc) | >=0 (chunk)     │           │        │
│  │  │  • embedding: [1536 dimensions]            │           │        │
│  │  │  • metadata: { skills, years, location }  │           │        │
│  │  │                                             │           │        │
│  │  └────────────────────────────────────────────┘           │        │
│  └────────────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## User Authentication Flow

### Registration Flow

```
┌─────────┐         ┌─────────────┐         ┌─────────────┐         ┌──────────┐
│         │         │             │         │             │         │          │
│ Browser │         │  NestJS     │         │   Users     │         │ MongoDB  │
│         │         │  Auth API   │         │  Service    │         │          │
└────┬────┘         └──────┬──────┘         └──────┬──────┘         └─────┬────┘
     │                     │                       │                       │
     │  1. POST /register  │                       │                       │
     │  {email, password}  │                       │                       │
     ├────────────────────►│                       │                       │
     │                     │                       │                       │
     │                     │  2. Validate input    │                       │
     │                     │     (DTO validation)  │                       │
     │                     ├───────────────────────┤                       │
     │                     │                       │                       │
     │                     │  3. Check if user     │                       │
     │                     │     already exists    │                       │
     │                     ├──────────────────────►│                       │
     │                     │                       │  4. Query by email    │
     │                     │                       ├──────────────────────►│
     │                     │                       │◄──────────────────────┤
     │                     │◄──────────────────────┤  5. Return null/user  │
     │                     │                       │                       │
     │                     │  6. Hash password     │                       │
     │                     │     (bcrypt, salt=10) │                       │
     │                     ├───────────────────────┤                       │
     │                     │                       │                       │
     │                     │  7. Create user       │                       │
     │                     ├──────────────────────►│                       │
     │                     │                       │  8. Insert document   │
     │                     │                       ├──────────────────────►│
     │                     │                       │◄──────────────────────┤
     │                     │◄──────────────────────┤  9. Return saved user │
     │                     │                       │                       │
     │                     │  10. Generate JWT     │                       │
     │                     │      token            │                       │
     │                     │      {userId, email}  │                       │
     │                     ├───────────────────────┤                       │
     │                     │                       │                       │
     │  11. Return token   │                       │                       │
     │      & user data    │                       │                       │
     │◄────────────────────┤                       │                       │
     │                     │                       │                       │
     │  12. Store token    │                       │                       │
     │      in storage     │                       │                       │
     ├─────────────────────┤                       │                       │
     │                     │                       │                       │
```

### Login Flow

```
┌─────────┐         ┌─────────────┐         ┌─────────────┐         ┌──────────┐
│ Browser │         │  NestJS     │         │   Users     │         │ MongoDB  │
│         │         │  Auth API   │         │  Service    │         │          │
└────┬────┘         └──────┬──────┘         └──────┬──────┘         └─────┬────┘
     │                     │                       │                       │
     │  1. POST /login     │                       │                       │
     │  {email, password}  │                       │                       │
     ├────────────────────►│                       │                       │
     │                     │                       │                       │
     │                     │  2. Find user by      │                       │
     │                     │     email             │                       │
     │                     ├──────────────────────►│                       │
     │                     │                       │  3. Query user        │
     │                     │                       ├──────────────────────►│
     │                     │                       │◄──────────────────────┤
     │                     │◄──────────────────────┤  4. Return user       │
     │                     │                       │                       │
     │                     │  5. Compare password  │                       │
     │                     │     with hash         │                       │
     │                     │     (bcrypt.compare)  │                       │
     │                     ├───────────────────────┤                       │
     │                     │                       │                       │
     │                     │  6. Generate JWT      │                       │
     │                     │     if valid          │                       │
     │                     ├───────────────────────┤                       │
     │                     │                       │                       │
     │  7. Return token    │                       │                       │
     │     & user          │                       │                       │
     │◄────────────────────┤                       │                       │
     │                     │                       │                       │
```

### Protected Route Access

```
┌─────────┐         ┌─────────────┐         ┌─────────────┐
│ Browser │         │  NestJS     │         │  JWT Guard  │
│         │         │  API        │         │             │
└────┬────┘         └──────┬──────┘         └──────┬──────┘
     │                     │                       │
     │  1. GET /cv/user/me │                       │
     │  Authorization:     │                       │
     │  Bearer <token>     │                       │
     ├────────────────────►│                       │
     │                     │                       │
     │                     │  2. Extract token     │
     │                     │     from header       │
     │                     ├──────────────────────►│
     │                     │                       │
     │                     │  3. Verify signature  │
     │                     │     and expiration    │
     │                     │     (JWT_SECRET)      │
     │                     │                       │
     │                     │  4. Decode payload    │
     │                     │     {userId, email}   │
     │                     │                       │
     │                     │  5. Attach to req     │
     │                     │     req.user = {...}  │
     │                     │◄──────────────────────┤
     │                     │                       │
     │                     │  6. Execute handler   │
     │                     │     with auth context │
     │                     ├───────────────────────┤
     │                     │                       │
     │  7. Return data     │                       │
     │◄────────────────────┤                       │
     │                     │                       │
```

---

## CV Upload and Parsing Flow

### Complete Upload Pipeline

```
┌──────────┐    ┌─────────┐    ┌───────────┐    ┌──────────┐    ┌─────────┐    ┌──────────┐
│          │    │         │    │           │    │          │    │         │    │          │
│ Frontend │    │ NestJS  │    │  FastAPI  │    │  Gemini  │    │  RAG    │    │ MongoDB  │
│          │    │   CV    │    │  Parser   │    │   AI     │    │ Service │    │          │
└────┬─────┘    └────┬────┘    └─────┬─────┘    └────┬─────┘    └────┬────┘    └────┬─────┘
     │               │               │               │               │              │
     │ 1. User       │               │               │               │              │
     │  selects PDF  │               │               │               │              │
     ├───────────────┤               │               │               │              │
     │               │               │               │               │              │
     │ 2. POST       │               │               │               │              │
     │  /cv/upload   │               │               │               │              │
     │  multipart    │               │               │               │              │
     │  form-data    │               │               │               │              │
     ├──────────────►│               │               │               │              │
     │               │               │               │               │              │
     │               │ 3. Multer     │               │               │              │
     │               │  saves file   │               │               │              │
     │               │  temporarily  │               │               │              │
     │               ├───────────────┤               │               │              │
     │               │               │               │               │              │
     │               │ 4. Read file  │               │               │              │
     │               │  as buffer    │               │               │              │
     │               ├───────────────┤               │               │              │
     │               │               │               │               │              │
     │               │ 5. POST       │               │               │              │
     │               │  /upload      │               │               │              │
     │               │  (forward)    │               │               │              │
     │               ├──────────────►│               │               │              │
     │               │               │               │               │              │
     │               │               │ 6. Extract    │               │              │
     │               │               │  text from    │               │              │
     │               │               │  PDF/Image    │               │              │
     │               │               │  (PyMuPDF/    │               │              │
     │               │               │   Tesseract)  │               │              │
     │               │               ├───────────────┤               │              │
     │               │               │               │               │              │
     │               │               │ 7. Detect     │               │              │
     │               │               │  language     │               │              │
     │               │               │  (Vietnamese?)│               │              │
     │               │               ├───────────────┤               │              │
     │               │               │               │               │              │
     │               │               │ 8. Translate  │               │              │
     │               │               │  if needed    │               │              │
     │               │               ├───────────────┤               │              │
     │               │               │               │               │              │
     │               │               │ 9. Send to    │               │              │
     │               │               │  Gemini with  │               │              │
     │               │               │  strict       │               │              │
     │               │               │  JSON schema  │               │              │
     │               │               ├──────────────►│               │              │
     │               │               │               │               │              │
     │               │               │               │ 10. Parse &   │              │
     │               │               │               │   extract     │              │
     │               │               │               │   structured  │              │
     │               │               │               │   CV data     │              │
     │               │               │               ├───────────────┤              │
     │               │               │               │               │              │
     │               │               │◄──────────────┤ 11. Return    │              │
     │               │               │  structured    │   JSON        │              │
     │               │               │  data          │               │              │
     │               │               │               │               │              │
     │               │               │ 12. Validate  │               │              │
     │               │               │   & normalize │               │              │
     │               │               │   data        │               │              │
     │               │               ├───────────────┤               │              │
     │               │               │               │               │              │
     │               │◄──────────────┤ 13. Return    │               │              │
     │               │  parsed CV     │   CV data     │               │              │
     │               │               │               │               │              │
     │               │ 14. Create CV │               │               │              │
     │               │   document    │               │               │              │
     │               │   with file   │               │               │              │
     │               │   metadata    │               │               │              │
     │               ├───────────────┼───────────────┼───────────────┼─────────────►│
     │               │               │               │               │              │
     │               │◄──────────────┼───────────────┼───────────────┼──────────────┤
     │               │ 15. Saved CV  │               │               │              │
     │               │               │               │               │              │
     │               │ 16. Index CV  │               │               │              │
     │               │   (async)     │               │               │              │
     │               ├───────────────┼───────────────┼───────────────►              │
     │               │               │               │               │              │
     │               │               │               │               │ 17. Build    │
     │               │               │               │               │   text from  │
     │               │               │               │               │   CV fields  │
     │               │               │               │               ├──────────────┤
     │               │               │               │               │              │
     │               │               │               │               │ 18. Chunk    │
     │               │               │               │               │   text       │
     │               │               │               │               │   (~1500     │
     │               │               │               │               │   chars)     │
     │               │               │               │               ├──────────────┤
     │               │               │               │               │              │
     │               │               │               │               │ 19. Create   │
     │               │               │   ┌───────────┐               │   embeddings │
     │               │               │   │  OpenAI   │◄──────────────┤   for each   │
     │               │               │   │  API      │               │   chunk      │
     │               │               │   └─────┬─────┘               │              │
     │               │               │         │                     │              │
     │               │               │         └────────────────────►│              │
     │               │               │                               │              │
     │               │               │               │               │ 20. Store    │
     │               │               │               │               │   embeddings │
     │               │               │               │               ├─────────────►│
     │               │               │               │               │              │
     │◄──────────────┤               │               │               │              │
     │ 21. Return    │               │               │               │              │
     │   success     │               │               │               │              │
     │               │               │               │               │              │
```

### CV Data Transformation

**Input (PDF)**:
```
Resume.pdf
├─ Raw text from PDF
└─ May contain images (OCR needed)
```

**After FastAPI Processing**:
```json
{
  "cv_id": "uuid",
  "status": "done",
  "result": {
    "fullname": "John Doe",
    "email": "john@example.com",
    "skills": [
      {"name": "JavaScript", "level": "Advanced", "years": 5},
      {"name": "React", "level": "Expert", "years": 3}
    ],
    "experiences": [
      {
        "title": "Senior Developer",
        "company": "Tech Corp",
        "from": "2020-01",
        "to": "Present",
        "responsibilities": ["Led team of 5", "Built microservices"]
      }
    ],
    "education": [...],
    "projects": [...],
    "certifications": [...]
  }
}
```

**After NestJS Processing & Storage**:
```javascript
{
  _id: ObjectId("..."),
  createdBy: ObjectId("user_id"),
  fullname: "John Doe",
  email: "john@example.com",
  skills: [...],
  experiences: [...],
  file: {
    filename: "1234567890-resume.pdf",
    path: "./uploads/cvs/1234567890-resume.pdf",
    size: 45678,
    uploadedAt: ISODate("2024-01-01T10:00:00Z")
  },
  createdAt: ISODate("2024-01-01T10:00:00Z"),
  updatedAt: ISODate("2024-01-01T10:00:00Z")
}
```

**After RAG Indexing**:
```javascript
// Document-level embedding
{
  _id: ObjectId("..."),
  sourceType: "cv",
  sourceId: "cv_id",
  chunkIndex: -1,
  text: "Combined CV text...",
  embedding: [0.123, 0.456, ..., 0.789], // 1536 dimensions
  metadata: {
    docLevel: true,
    fullname: "John Doe",
    skillsNormalized: ["javascript", "react", "node.js"],
    candYears: 8,
    seniorityKey: "senior",
    locationNormalized: {
      city: "san francisco",
      country: "usa",
      remote: false
    }
  }
}

// Chunk-level embeddings
{
  sourceType: "cv",
  sourceId: "cv_id",
  chunkIndex: 0,
  text: "First chunk text...",
  embedding: [...],
  metadata: {...}
},
{
  sourceType: "cv",
  sourceId: "cv_id",
  chunkIndex: 1,
  text: "Second chunk text...",
  embedding: [...],
  metadata: {...}
}
// ... more chunks
```

---

## Job Creation and Indexing Flow

```
┌──────────┐    ┌─────────┐    ┌─────────┐    ┌──────────┐    ┌──────────┐
│          │    │         │    │         │    │          │    │          │
│ Frontend │    │ NestJS  │    │  RAG    │    │  OpenAI  │    │ MongoDB  │
│          │    │   Job   │    │ Service │    │   API    │    │          │
└────┬─────┘    └────┬────┘    └────┬────┘    └────┬─────┘    └────┬─────┘
     │               │              │              │              │
     │ 1. POST /job  │              │              │              │
     │  {job data}   │              │              │              │
     ├──────────────►│              │              │              │
     │               │              │              │              │
     │               │ 2. Validate  │              │              │
     │               │  input (DTO) │              │              │
     │               ├──────────────┤              │              │
     │               │              │              │              │
     │               │ 3. Save job  │              │              │
     │               ├─────────────────────────────────────────────►
     │               │              │              │              │
     │               │◄─────────────┼──────────────┼──────────────┤
     │               │ 4. Saved job │              │              │
     │               │              │              │              │
     │               │ 5. Trigger   │              │              │
     │               │  indexing    │              │              │
     │               ├─────────────►│              │              │
     │               │              │              │              │
     │               │              │ 6. Build job │              │
     │               │              │  text from   │              │
     │               │              │  fields      │              │
     │               │              ├──────────────┤              │
     │               │              │              │              │
     │               │              │ 7. Detect    │              │
     │               │              │  language &  │              │
     │               │              │  translate   │              │
     │               │              ├─────────────►│              │
     │               │              │              │              │
     │               │              │◄─────────────┤              │
     │               │              │              │              │
     │               │              │ 8. Create    │              │
     │               │              │  doc-level   │              │
     │               │              │  embedding   │              │
     │               │              ├─────────────►│              │
     │               │              │              │              │
     │               │              │◄─────────────┤              │
     │               │              │ 9. Embedding │              │
     │               │              │              │              │
     │               │              │ 10. Store    │              │
     │               │              │   doc emb    │              │
     │               │              ├─────────────────────────────►
     │               │              │              │              │
     │               │              │ 11. Chunk    │              │
     │               │              │   text       │              │
     │               │              ├──────────────┤              │
     │               │              │              │              │
     │               │              │ 12. Create   │              │
     │               │              │   embeddings │              │
     │               │              │   for chunks │              │
     │               │              ├─────────────►│              │
     │               │              │              │              │
     │               │              │◄─────────────┤              │
     │               │              │              │              │
     │               │              │ 13. Store    │              │
     │               │              │   chunk embs │              │
     │               │              ├─────────────────────────────►
     │               │              │              │              │
     │               │◄─────────────┤              │              │
     │◄──────────────┤ 14. Return   │              │              │
     │ 15. Success   │   saved job  │              │              │
     │               │              │              │              │
```

---

## Semantic Matching Flow

### CV-to-Jobs Matching (Find Jobs for a CV)

```
┌──────────┐    ┌─────────┐    ┌──────────┐    ┌──────────┐
│          │    │         │    │          │    │          │
│ Frontend │    │ NestJS  │    │  OpenAI  │    │ MongoDB  │
│          │    │   RAG   │    │   API    │    │          │
└────┬─────┘    └────┬────┘    └────┬─────┘    └────┬─────┘
     │               │              │              │
     │ 1. GET /rag/  │              │              │
     │  match-all-   │              │              │
     │  jobs-for-cv  │              │              │
     │  -doc/:cvId   │              │              │
     ├──────────────►│              │              │
     │               │              │              │
     │               │ 2. Fetch CV  │              │
     │               ├─────────────────────────────►
     │               │              │              │
     │               │◄─────────────┼──────────────┤
     │               │ 3. CV data   │              │
     │               │              │              │
     │               │ 4. Get CV    │              │
     │               │  doc-level   │              │
     │               │  embedding   │              │
     │               ├─────────────────────────────►
     │               │              │              │
     │               │◄─────────────┼──────────────┤
     │               │ 5. CV embed  │              │
     │               │              │              │
     │               │ 6. If not    │              │
     │               │  found,      │              │
     │               │  create new  │              │
     │               ├─────────────►│              │
     │               │              │              │
     │               │◄─────────────┤              │
     │               │              │              │
     │               │ 7. Fetch all │              │
     │               │  job doc     │              │
     │               │  embeddings  │              │
     │               ├─────────────────────────────►
     │               │              │              │
     │               │◄─────────────┼──────────────┤
     │               │ 8. Job embeds│              │
     │               │  with        │              │
     │               │  metadata    │              │
     │               │              │              │
     │               │ 9. For each  │              │
     │               │  job:        │              │
     │               │              │              │
     │               │  a. Cosine   │              │
     │               │     similarity│             │
     │               │     (semantic)│             │
     │               ├──────────────┤              │
     │               │              │              │
     │               │  b. Extract  │              │
     │               │     metadata │              │
     │               │     (skills, │              │
     │               │     exp,     │              │
     │               │     location)│              │
     │               ├──────────────┤              │
     │               │              │              │
     │               │  c. Calculate│              │
     │               │     non-     │              │
     │               │     semantic │              │
     │               │     scores   │              │
     │               ├──────────────┤              │
     │               │              │              │
     │               │  d. Combine  │              │
     │               │     scores:  │              │
     │               │     W_SEM *  │              │
     │               │     semantic │              │
     │               │     + W_NON *│              │
     │               │     non_sem  │              │
     │               ├──────────────┤              │
     │               │              │              │
     │               │  e. Apply    │              │
     │               │     filters  │              │
     │               │     (min     │              │
     │               │     thresholds)             │
     │               ├──────────────┤              │
     │               │              │              │
     │               │ 10. Sort by  │              │
     │               │   score DESC │              │
     │               ├──────────────┤              │
     │               │              │              │
     │               │ 11. Apply    │              │
     │               │   pagination │              │
     │               │   & topK     │              │
     │               ├──────────────┤              │
     │               │              │              │
     │◄──────────────┤ 12. Return   │              │
     │ 13. Display   │   ranked     │              │
     │   matched jobs│   jobs       │              │
     │               │              │              │
```

### Scoring Calculation Detail

```
For each Job-CV pair:

1. Semantic Score (cosine similarity):
   ────────────────────────────────────
   cos_sim = dot(job_emb, cv_emb) / (||job_emb|| * ||cv_emb||)
   semantic_score = (cos_sim + 1) / 2  // Normalize to [0, 1]

2. Skills Score:
   ──────────────
   matched_skills = intersection(job_skills, cv_skills)
   skills_score = matched_skills / job_skills_count

3. Experience Score:
   ──────────────────
   if job_exp_required > 0:
     exp_score = min(1, cv_years / job_exp_required)
   else:
     exp_score = 1

4. Seniority Score:
   ──────────────────
   rank_diff = abs(job_rank - cv_rank)
   seniority_score = max(0, 1 - rank_diff / job_rank)

5. Location Score:
   ──────────────────
   if both_remote: 1.0
   elif one_remote: 0.7
   elif same_city: 1.0
   elif same_country: 0.9
   else: 0.4

6. Non-Semantic Combined:
   ────────────────────────
   non_semantic = 0.6 * skills_score
                + 0.2 * exp_score
                + 0.1 * seniority_score
                + 0.1 * location_score

7. Final Score:
   ────────────
   final_score = 0.7 * semantic_score
               + 0.3 * non_semantic

8. Filtering:
   ───────────
   if semantic_score < 0.45: REJECT
   if final_score < 0.5: REJECT
   if skills_score < 0.2 (when job has skills): REJECT
```

---

## AI Chatbot Query Flow

```
┌──────────┐    ┌─────────┐    ┌──────────┐    ┌──────────┐
│          │    │         │    │          │    │          │
│ Frontend │    │ NestJS  │    │  OpenAI  │    │ MongoDB  │
│  Chatbot │    │   RAG   │    │   API    │    │          │
└────┬─────┘    └────┬────┘    └────┬─────┘    └────┬─────┘
     │               │              │              │
     │ 1. POST /rag/ │              │              │
     │  ask          │              │              │
     │  {question}   │              │              │
     ├──────────────►│              │              │
     │               │              │              │
     │               │ 2. Create    │              │
     │               │  embedding   │              │
     │               │  for question│              │
     │               ├─────────────►│              │
     │               │              │              │
     │               │◄─────────────┤              │
     │               │ 3. Query emb │              │
     │               │              │              │
     │               │ 4. Search    │              │
     │               │  similar     │              │
     │               │  chunks in   │              │
     │               │  embeddings  │              │
     │               │  collection  │              │
     │               ├─────────────────────────────►
     │               │              │              │
     │               │              │              │
     │               │ 5. For each  │              │
     │               │  chunk:      │              │
     │               │  - Calculate │              │
     │               │    cosine    │              │
     │               │    similarity│              │
     │               │  - Sort by   │              │
     │               │    score     │              │
     │               ├──────────────┤              │
     │               │              │              │
     │               │◄─────────────┼──────────────┤
     │               │ 6. Top K     │              │
     │               │  contexts    │              │
     │               │  (default 5) │              │
     │               │              │              │
     │               │ 7. Build     │              │
     │               │  prompt with │              │
     │               │  contexts    │              │
     │               ├──────────────┤              │
     │               │              │              │
     │               │ System:      │              │
     │               │  "You are    │              │
     │               │   ConnectJob │              │
     │               │   assistant. │              │
     │               │   Use ONLY   │              │
     │               │   provided   │              │
     │               │   context..."│              │
     │               │              │              │
     │               │ User:        │              │
     │               │  "Question:  │              │
     │               │   {question} │              │
     │               │              │              │
     │               │   Contexts:  │              │
     │               │   [[1]       │              │
     │               │   cv:abc#0]  │              │
     │               │   {text}     │              │
     │               │   [[2]       │              │
     │               │   cv:def#1]  │              │
     │               │   {text}..." │              │
     │               │              │              │
     │               │ 8. Send to   │              │
     │               │  GPT         │              │
     │               ├─────────────►│              │
     │               │              │              │
     │               │              │ 9. Generate  │
     │               │              │  answer with │
     │               │              │  citations   │
     │               │              ├──────────────┤
     │               │              │              │
     │               │◄─────────────┤              │
     │               │ 10. Answer   │              │
     │               │              │              │
     │◄──────────────┤ 11. Return   │              │
     │ 12. Display   │   answer +   │              │
     │   in chat UI  │   sources    │              │
     │               │              │              │
```

### Example Chatbot Interaction

**User Question**:
```
"Find me candidates with React experience in San Francisco"
```

**RAG Process**:
1. Question → Embedding: `[0.123, 0.456, ..., 0.789]`
2. Search embeddings collection for similar chunks
3. Retrieve top 5 contexts:
   - cv:abc123#chunk0: "5 years React development, San Francisco..."
   - cv:def456#chunk2: "Expert in React and Redux, SF Bay Area..."
   - cv:ghi789#chunk1: "Built React applications, located in SF..."
   - cv:jkl012#chunk0: "Senior React developer, California..."
   - cv:mno345#chunk3: "React Native experience, remote..."

**GPT Response**:
```
Based on the available data, I found several candidates with React
experience in San Francisco:

1. [1] Candidate with 5 years of React development experience, based
   in San Francisco
   
2. [2] Expert React developer with Redux skills in the SF Bay Area

3. [3] Developer who built React applications, currently located in SF

These candidates match your requirements for React experience and San
Francisco location. Would you like more details about any specific
candidate?

Sources: [cv:abc123#0], [cv:def456#2], [cv:ghi789#1]
```

---

## Real-time Search Flow

### Frontend Search with Debouncing

```
┌──────────┐                     ┌─────────┐                     ┌──────────┐
│          │                     │         │                     │          │
│ Frontend │                     │ NestJS  │                     │ MongoDB  │
│  Search  │                     │   API   │                     │          │
└────┬─────┘                     └────┬────┘                     └────┬─────┘
     │                                │                               │
     │ User types "React"             │                               │
     ├─────────────────────           │                               │
     │                                │                               │
     │ User types "React Developer"   │                               │
     ├─────────────────────           │                               │
     │                                │                               │
     │ [300ms debounce]               │                               │
     ├─────────────────────           │                               │
     │                                │                               │
     │ GET /cv/search?q=React+Developer                              │
     ├───────────────────────────────►│                               │
     │                                │                               │
     │                                │ Build regex query             │
     │                                │ /React Developer/i            │
     │                                ├───────────────────            │
     │                                │                               │
     │                                │ Query: $or: [                 │
     │                                │   {fullname: regex},          │
     │                                │   {skills.name: regex},       │
     │                                │   {targetRole: regex},        │
     │                                │   {headline: regex},          │
     │                                │   {summary: regex}            │
     │                                │ ]                             │
     │                                ├──────────────────────────────►
     │                                │                               │
     │                                │◄──────────────────────────────┤
     │                                │ Matching CVs (limit 20)       │
     │                                │                               │
     │◄───────────────────────────────┤                               │
     │ Display results                │                               │
     │                                │                               │
```

---

## Summary

This document provides detailed visualization of the data flows in the Smart Job Connect system. Key takeaways:

1. **Multi-layer Architecture**: Clean separation between presentation, application, and data layers
2. **AI Integration**: Two AI services (Gemini for parsing, OpenAI for embeddings/chat)
3. **Async Processing**: CV indexing happens asynchronously after saving
4. **Hybrid Matching**: Combines semantic search with traditional filtering
5. **RAG Pattern**: Context retrieval before LLM generation for accurate responses
6. **Security**: JWT-based authentication protecting all sensitive endpoints
7. **Scalability**: Chunking and embedding strategy supports large document corpus

The system demonstrates modern best practices in building AI-powered applications with proper separation of concerns and efficient data flow patterns.
