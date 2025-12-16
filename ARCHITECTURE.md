# Smart Job Connect - System Architecture Documentation

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Component Details](#component-details)
4. [Data Flow](#data-flow)
5. [Key Technologies](#key-technologies)
6. [API Integration](#api-integration)
7. [Database Schema](#database-schema)
8. [Security & Authentication](#security--authentication)

---

## Overview

**Smart Job Connect** is an intelligent job matching platform that leverages AI (LLM/RAG) to connect job seekers with suitable positions. The system uses semantic search and matching algorithms to analyze CVs and job requirements, providing smart recommendations for both candidates and employers.

### High-Level Architecture

```
┌─────────────────┐
│                 │
│    Frontend     │  React + TypeScript + Vite
│   (Port 3001)   │  
│                 │
└────────┬────────┘
         │ HTTP/REST
         │
┌────────▼────────┐
│                 │
│   NestJS API    │  Node.js + TypeScript + MongoDB
│   (Port 3000)   │  JWT Authentication
│                 │  
└─────┬─────┬─────┘
      │     │
      │     │ HTTP
      │     │
      │   ┌─▼─────────────┐
      │   │               │
      │   │  FastAPI      │  Python + Gemini AI
      │   │  (Port 8000)  │  Resume Parser
      │   │               │
      │   └───────────────┘
      │
      │
┌─────▼──────┐     ┌──────────────┐
│            │     │              │
│  MongoDB   │     │  OpenAI API  │  Embeddings & LLM
│  Database  │     │  (External)  │  RAG System
│            │     │              │
└────────────┘     └──────────────┘
```

---

## System Architecture

### 1. Frontend (fe/)
- **Framework**: React 19.2.0 with TypeScript
- **Build Tool**: Vite 6.2.0
- **Routing**: React Router DOM 6.22.3
- **State Management**: React Context API
- **HTTP Client**: Axios 1.6.0
- **UI Components**: Custom components with Lucide icons

**Key Features**:
- User authentication (Login/Register)
- Job browsing and search
- Candidate browsing and search
- CV/Profile management
- AI-powered chatbot integration
- Real-time job-candidate matching
- Responsive design

**Main Pages**:
- Home (`/`)
- Login (`/login`)
- Register (`/register`)
- Jobs listing (`/jobs`)
- Job detail (`/jobs/:id`)
- Candidates listing (`/candidates`)
- Candidate detail (`/candidates/:id`)
- Profile creation (`/create-profile`)
- User profile (`/profile`)

### 2. Backend - NestJS (be/)
- **Framework**: NestJS 11.0.1 with TypeScript
- **Database**: MongoDB via Mongoose 8.20.1
- **Authentication**: JWT with Passport
- **File Upload**: Multer for PDF processing
- **AI Integration**: OpenAI API for embeddings and completions

**Key Modules**:

#### a. Auth Module (`src/auth/`)
- User authentication with JWT tokens
- Password hashing with bcrypt
- Token-based session management
- Guard implementation for protected routes

#### b. Users Module (`src/users/`)
- User account management
- Profile information storage
- User-CV relationships

#### c. CV Module (`src/modules/cv/`)
- CV/Resume management (CRUD operations)
- File upload and storage (PDF)
- Integration with FastAPI for resume parsing
- CV-to-structured-data conversion
- Search and filter functionality

**Key Endpoints**:
```
POST   /cv              - Create new CV
GET    /cv              - List all CVs (with filters)
GET    /cv/:id          - Get CV by ID
PUT    /cv/:id          - Update CV
DELETE /cv/:id          - Delete CV
GET    /cv/user/me      - Get current user's CVs
POST   /cv/upload       - Upload PDF resume
GET    /cv/file/:filename - Download CV file
```

#### d. Job Module (`src/modules/job/`)
- Job posting management (CRUD)
- Job search and filtering
- Company information
- Requirements specification
- Skills and qualifications tracking

**Key Endpoints**:
```
POST   /job             - Create new job
GET    /job             - List all jobs (with filters)
GET    /job/:id         - Get job by ID
PUT    /job/:id         - Update job
DELETE /job/:id         - Delete job
GET    /job/search      - Search jobs
```

#### e. RAG Module (`src/modules/rag/`)
This is the **core intelligence** of the system, implementing Retrieval-Augmented Generation for semantic matching.

**Features**:
- Document embedding generation using OpenAI
- Vector similarity search
- CV indexing and chunking
- Job indexing and chunking
- Multi-language support (Vietnamese to English translation)
- Semantic search with context retrieval
- AI-powered Q&A chatbot

**Key Endpoints**:
```
POST   /rag/index-cv/:id                    - Index single CV
POST   /rag/index-all-cv                    - Index all CVs
POST   /rag/index-job/:id                   - Index single job
POST   /rag/index-all-job                   - Index all jobs
POST   /rag/ask                             - Ask question (RAG chatbot)
GET    /rag/retrieve                        - Retrieve similar documents
GET    /rag/match-all-cvs-for-job-doc/:jobId - Match CVs to a job
GET    /rag/match-all-jobs-for-cv-doc/:cvId  - Match jobs to a CV
GET    /rag/match-job-cv-chunks/:jobId/:cvId - Chunk-level matching
```

**Matching Algorithm**:
The RAG service uses a hybrid scoring approach:
- **Semantic Score (W_SEM = 0.5-0.7)**: Cosine similarity of embeddings
- **Non-Semantic Score (W_NON = 0.3-0.5)**: Combination of:
  - Skills match (60%)
  - Experience years (20%)
  - Seniority level (10%)
  - Location compatibility (10%)

Filters:
- Minimum semantic threshold: 0.45-0.5
- Minimum final score: 0.5-0.62
- Minimum skill score: 0.2-0.4

### 3. FastAPI Service (fastApi-python/)
- **Framework**: FastAPI with Python
- **AI Engine**: Google Gemini 2.5 Flash
- **Document Processing**: PyMuPDF (fitz), pytesseract
- **Async Processing**: Multiprocessing with spawn context

**Purpose**: Resume/CV parsing and extraction

**Main Endpoint**:
```
POST /upload
```

**Process Flow**:
1. Receives uploaded file (PDF, PNG, JPG, JPEG)
2. Extracts text from document:
   - PDF: Uses PyMuPDF (fitz)
   - Images: Uses Tesseract OCR
3. Translates to English if Vietnamese detected
4. Sends to Gemini AI for structured extraction
5. Validates and normalizes the output
6. Returns structured CV data matching the CV schema

**CV Schema Fields**:
- Personal: fullname, email, phone, location, avatar
- Professional: headline, summary, targetRole, skills
- Experience: work history with responsibilities & achievements
- Education: degrees, schools, GPA
- Projects: personal/professional projects
- Certifications: professional certifications
- Languages: language proficiency
- Portfolio: work samples
- References: professional references

---

## Data Flow

### 1. User Registration & Authentication Flow

```
┌──────────┐                  ┌──────────────┐                 ┌──────────┐
│          │   POST /register │              │                 │          │
│ Frontend ├─────────────────►│  NestJS      ├────────────────►│ MongoDB  │
│          │                  │  Auth Module │  Store user     │          │
│          │◄─────────────────┤              │◄────────────────┤          │
│          │   JWT Token      │              │                 │          │
└──────────┘                  └──────────────┘                 └──────────┘

POST /login follows same pattern with credential verification
```

### 2. CV Upload & Parsing Flow

```
┌──────────┐              ┌──────────────┐              ┌───────────┐              ┌──────────┐
│          │  1. POST     │              │  2. Forward  │           │              │          │
│ Frontend ├─────────────►│  NestJS      ├─────────────►│  FastAPI  ├─────────────►│ Gemini   │
│          │  /cv/upload  │  CV Module   │  file        │  Parser   │  Extract     │ AI       │
│          │  (PDF)       │              │              │           │              │          │
│          │              │              │              │           │◄─────────────┤          │
│          │              │              │              │           │ Structured   │          │
│          │              │              │◄─────────────┤           │ data         └──────────┘
│          │              │              │ 3. Return    │           │
│          │              │              │  parsed CV   │           │
│          │              │              │              └───────────┘
│          │              │              │
│          │              │  4. Save to  │
│          │              │  MongoDB     │
│          │              │              │              ┌──────────┐
│          │              │  5. Index    │              │          │
│          │              ├─────────────────────────────► RAG      │
│          │              │  in RAG      │              │ Service  │
│          │◄─────────────┤              │              │          │
│          │ 6. Return    │              │              └──────────┘
│          │ saved CV     │              │
└──────────┘              └──────────────┘
```

**Detailed Steps**:
1. User uploads PDF resume via frontend
2. NestJS receives file, stores temporarily
3. NestJS forwards file to FastAPI `/upload` endpoint
4. FastAPI extracts text (PDF/OCR)
5. FastAPI sends text to Gemini for AI parsing
6. Gemini returns structured CV data
7. FastAPI normalizes and validates data
8. FastAPI returns structured CV to NestJS
9. NestJS saves CV document to MongoDB
10. NestJS triggers RAG indexing (async)
11. RAG service chunks text, creates embeddings
12. Embeddings stored in MongoDB for semantic search
13. NestJS returns saved CV to frontend

### 3. Job Creation & Indexing Flow

```
┌──────────┐              ┌──────────────┐              ┌──────────┐              ┌──────────┐
│          │  1. POST     │              │  2. Save     │          │              │          │
│ Frontend ├─────────────►│  NestJS      ├─────────────►│ MongoDB  │              │ OpenAI   │
│          │  /job        │  Job Module  │              │          │              │ API      │
│          │              │              │              │          │              │          │
│          │              │  3. Index    │              │          │              │          │
│          │              ├──────────────┼──────────────┼──────────┼─────────────►│          │
│          │              │              │              │          │  4. Create   │          │
│          │              │  RAG         │              │          │  embeddings  │          │
│          │              │  Service     │◄─────────────┼──────────┼──────────────┤          │
│          │              │              │              │          │              │          │
│          │              │  5. Store    │              │          │              └──────────┘
│          │              │  embeddings  │              │          │
│          │              ├─────────────►│              │          │
│          │◄─────────────┤              │              │          │
│          │  6. Return   │              │              │          │
│          │  saved job   │              │              │          │
└──────────┘              └──────────────┘              └──────────┘
```

### 4. Job-CV Matching Flow (Semantic Search)

```
┌──────────┐              ┌──────────────┐              ┌──────────┐              ┌──────────┐
│          │  1. GET      │              │  2. Fetch    │          │              │          │
│ Frontend ├─────────────►│  NestJS      ├─────────────►│ MongoDB  │              │          │
│          │  /rag/match- │  RAG Module  │  embeddings  │          │              │          │
│          │  all-cvs-for-│              │◄─────────────┤          │              │          │
│          │  job-doc/:id │              │              │          │              │          │
│          │              │  3. Compute  │              │          │              │  OpenAI  │
│          │              │  similarity  │              │          │              │  (if     │
│          │              │              │              │          │              │  needed) │
│          │              │  - Cosine    │              │          │              │          │
│          │              │  - Skills    │              │          │              │          │
│          │              │  - Experience│              │          │◄────────────►│          │
│          │              │  - Location  │              │          │  Translation │          │
│          │              │              │              │          │  or new emb  │          │
│          │              │  4. Score &  │              │          │              └──────────┘
│          │              │  Filter      │              │          │
│          │◄─────────────┤              │              │          │
│          │  5. Return   │              │              │          │
│          │  ranked list │              │              │          │
└──────────┘              └──────────────┘              └──────────┘
```

**Matching Process**:
1. Frontend requests matches for a job
2. RAG service retrieves job's document-level embedding
3. RAG service retrieves all CV embeddings from MongoDB
4. For each CV:
   - Calculate cosine similarity (semantic score)
   - Extract metadata (skills, experience, seniority, location)
   - Calculate non-semantic scores
   - Combine scores with weighted formula
   - Apply minimum thresholds
5. Sort by final score descending
6. Apply pagination and topK filtering
7. Return ranked list with scores

### 5. AI Chatbot Query Flow

```
┌──────────┐              ┌──────────────┐              ┌──────────┐              ┌──────────┐
│          │  1. POST     │              │  2. Create   │          │              │          │
│ Frontend ├─────────────►│  NestJS      ├─────────────►│ OpenAI   │              │          │
│          │  /rag/ask    │  RAG Module  │  embedding   │ API      │              │          │
│          │  {question}  │              │◄─────────────┤          │              │          │
│          │              │              │              │          │              │          │
│          │              │  3. Search   │              │          │              │          │
│          │              │  similar     │              │          │              │          │
│          │              ├─────────────►│              │          │              │ MongoDB  │
│          │              │              │              │          │              │          │
│          │              │  4. Retrieve │              │          │              │          │
│          │              │  context     │              │          │              │          │
│          │              │◄─────────────┤              │          │              │          │
│          │              │              │              │          │              │          │
│          │              │  5. Generate │              │          │              │          │
│          │              ├─────────────────────────────►│          │              │          │
│          │              │  answer with │              │ OpenAI   │              │          │
│          │              │  context     │              │ GPT      │              │          │
│          │              │◄─────────────┼──────────────┤          │              │          │
│          │◄─────────────┤              │              │          │              │          │
│          │  6. Return   │              │              │          │              │          │
│          │  answer      │              │              │          │              │          │
└──────────┘              └──────────────┘              └──────────┘              └──────────┘
```

---

## Key Technologies

### Frontend Stack
- **React 19.2.0**: Modern React with concurrent features
- **TypeScript 5.8.2**: Type-safe development
- **Vite 6.2.0**: Fast build tool and dev server
- **React Router DOM 6.22.3**: Client-side routing
- **Axios 1.6.0**: HTTP client with interceptors
- **Lucide React 0.555.0**: Icon library
- **React Hook Form 7.68.0**: Form management

### Backend (NestJS) Stack
- **NestJS 11.0.1**: Progressive Node.js framework
- **TypeScript 5.9.3**: Type-safe server code
- **MongoDB 8.20.1 (Mongoose)**: NoSQL database
- **JWT 11.0.1**: Token-based authentication
- **Passport 0.7.0**: Authentication middleware
- **Bcrypt 3.0.3**: Password hashing
- **OpenAI 4.104.0**: AI/ML integration
- **Multer 2.0.2**: File upload handling
- **Axios 1.13.2**: HTTP client for service communication

### FastAPI Stack
- **FastAPI**: Modern Python web framework
- **Uvicorn**: ASGI server
- **PyMuPDF (fitz)**: PDF text extraction
- **Pytesseract**: OCR for images
- **Google Generative AI**: Gemini AI integration
- **Python-multipart**: File upload handling
- **Pydantic**: Data validation

### AI/ML Technologies
- **OpenAI GPT-4o-mini**: Text generation and completion
- **OpenAI text-embedding-3-small**: Text embedding generation
- **Google Gemini 2.5 Flash**: Resume parsing and extraction
- **RAG (Retrieval-Augmented Generation)**: Context-aware AI responses

### Database
- **MongoDB**: Document-oriented NoSQL database
  - Collections: users, cvs, jobs, embeddings
  - Indexes: text search, geospatial, compound indexes

---

## API Integration

### Frontend ↔ NestJS Communication

**Base URL**: Configured in `fe/lib/api.ts`
- Production: ngrok tunnel or deployed URL
- Development: `http://localhost:3000`

**Authentication**:
- JWT tokens stored in sessionStorage/localStorage
- Bearer token sent in Authorization header
- Interceptor attaches token to all requests

**Key API Calls**:

```typescript
// Authentication
POST /auth/register
POST /auth/login
GET  /auth/profile

// CV Management
POST   /cv
GET    /cv
GET    /cv/:id
PUT    /cv/:id
DELETE /cv/:id
POST   /cv/upload

// Job Management  
POST   /job
GET    /job
GET    /job/:id
PUT    /job/:id
DELETE /job/:id

// Matching & Search
GET  /rag/match-all-cvs-for-job-doc/:jobId
GET  /rag/match-all-jobs-for-cv-doc/:cvId
GET  /rag/match-job-cv-chunks/:jobId/:cvId
POST /rag/ask
GET  /rag/retrieve
```

### NestJS ↔ FastAPI Communication

**Configuration**: 
- Base URL: `FASTAPI_BASE_URL` from environment (.env)
- Default: `http://localhost:8000`
- Timeout: 120 seconds (configurable)

**Integration Point**: `cv.service.ts` → `uploadToFastApi()`

```typescript
// NestJS sends multipart/form-data
POST http://localhost:8000/upload
Content-Type: multipart/form-data
Body: file (PDF/Image)

// FastAPI returns structured CV data
Response: {
  cv_id: string,
  status: "done" | "error",
  result?: {
    fullname: string,
    email: string,
    phone: string,
    skills: Array<Skill>,
    experiences: Array<Experience>,
    education: Array<Education>,
    // ... full CV schema
  },
  error?: string
}
```

### NestJS ↔ OpenAI Communication

**Service**: `rag/openai.service.ts`

**API Calls**:
1. **Embeddings**:
```typescript
POST https://api.openai.com/v1/embeddings
{
  model: "text-embedding-3-small",
  input: "text to embed"
}
// Returns: 1536-dimension vector
```

2. **Chat Completions**:
```typescript
POST https://api.openai.com/v1/chat/completions
{
  model: "gpt-4o-mini",
  messages: [
    { role: "system", content: "..." },
    { role: "user", content: "..." }
  ],
  max_tokens: 600-1200
}
```

**Use Cases**:
- Creating embeddings for CVs and jobs
- Vietnamese to English translation
- RAG-based Q&A responses
- Semantic search queries

### FastAPI ↔ Gemini AI Communication

**Service**: `parser.py`

**API Configuration**:
```python
import google.generativeai as gemini
gemini.configure(api_key=GEMINI_API_KEY)
model = gemini.GenerativeModel("gemini-2.5-flash")
```

**Process**:
1. Extract text from document
2. Check if Vietnamese (heuristic detection)
3. Translate to English if needed
4. Send to Gemini with strict JSON schema prompt
5. Parse and validate response
6. Normalize data to match CV schema

---

## Database Schema

### Collections Overview

#### 1. **users** Collection
```javascript
{
  _id: ObjectId,
  email: String (unique, required),
  password: String (hashed, required),
  fullname: String,
  role: String ("candidate" | "employer"),
  createdAt: Date,
  updatedAt: Date
}
```

#### 2. **cvs** Collection
```javascript
{
  _id: ObjectId,
  createdBy: ObjectId (ref: users),
  
  // Personal Info
  fullname: String,
  preferredName: String,
  email: String,
  phone: String,
  avatarUrl: String,
  location: {
    city: String,
    state: String,
    country: String
  },
  
  // Professional Info
  headline: String,
  summary: String,
  targetRole: String,
  employmentType: [String],
  salaryExpectation: String,
  availability: String,
  
  // Skills
  skills: [{
    name: String,
    level: String,
    category: String,
    years: Number
  }],
  
  // Experience
  experiences: [{
    id: String,
    title: String,
    company: String,
    companyWebsite: String,
    location: String,
    from: Date,
    to: Date,
    isCurrent: Boolean,
    employmentType: String,
    teamSize: Number,
    responsibilities: [String],
    achievements: [String],
    tags: [String]
  }],
  
  // Education
  education: [{
    degree: String,
    major: String,
    school: String,
    from: Date,
    to: Date,
    gpa: String
  }],
  
  // Projects
  projects: [{
    name: String,
    description: String,
    role: String,
    from: Date,
    to: Date,
    techStack: [String],
    url: String,
    metrics: [String]
  }],
  
  // Certifications
  certifications: [{
    name: String,
    issuer: String,
    issueDate: Date,
    expiryDate: Date,
    credentialUrl: String
  }],
  
  // Languages
  languages: [{
    name: String,
    level: String
  }],
  
  // Portfolio
  portfolio: [{
    mediaType: String,
    url: String,
    description: String
  }],
  
  // References
  references: [{
    name: String,
    relation: String,
    contact: String,
    note: String
  }],
  
  // File info
  file: {
    filename: String,
    originalname: String,
    path: String,
    mimetype: String,
    size: Number,
    uploadedAt: Date
  },
  
  // Metadata
  status: String,
  tags: [String],
  version: Number,
  createdAt: Date,
  updatedAt: Date
}
```

#### 3. **jobs** Collection
```javascript
{
  _id: ObjectId,
  createdBy: ObjectId (ref: users),
  
  // Basic Info
  title: String (required),
  companyName: String,
  companyIndustry: String,
  department: String,
  seniority: String,
  teamSize: Number,
  
  // Location
  location: {
    city: String,
    state: String,
    country: String,
    remoteType: String ("remote" | "hybrid" | "onsite")
  },
  remote: Boolean,
  
  // Description
  description: String,
  responsibilities: [String],
  requirements: [String],
  niceToHave: [String],
  
  // Skills
  skills: [{
    name: String,
    level: String,
    required: Boolean
  }],
  
  // Requirements
  experienceYears: Number,
  educationLevel: String,
  
  // Compensation
  salary: {
    min: Number,
    max: Number,
    currency: String,
    period: String
  },
  benefits: [String],
  bonus: String,
  equity: String,
  
  // Application
  applicationDeadline: Date,
  startDate: Date,
  preScreenQuestions: [{
    q: String,
    type: String,
    required: Boolean
  }],
  
  // Metadata
  status: String ("open" | "closed"),
  tags: [String],
  categories: [String],
  createdAt: Date,
  updatedAt: Date
}
```

#### 4. **embeddings** Collection
```javascript
{
  _id: ObjectId,
  
  // Source identification
  sourceType: String ("cv" | "job"),
  sourceId: String (ObjectId as string),
  chunkIndex: Number (-1 for doc-level, >=0 for chunks),
  
  // Content
  text: String (original or translated text),
  embedding: [Number] (1536-dim vector from OpenAI),
  
  // Metadata
  metadata: {
    // Common
    docLevel: Boolean,
    textPreview: String,
    originalLanguage: String ("en" | "vi"),
    translated: Boolean,
    originalTextPreview: String,
    
    // CV-specific
    fullname: String,
    skillsNormalized: [String],
    candYears: Number,
    seniorityKey: String,
    locationNormalized: {
      city: String,
      country: String,
      remote: Boolean
    },
    
    // Job-specific
    jobTitle: String,
    companyName: String,
    jobSkillsNormalized: [String],
    experienceYears: Number
  },
  
  createdAt: Date,
  updatedAt: Date
}

// Indexes:
// - { sourceType: 1, sourceId: 1, chunkIndex: 1 } (unique)
// - { sourceType: 1, chunkIndex: 1 }
```

### Indexing Strategy

**Text Embeddings**:
- Each document (CV/Job) has one doc-level embedding (chunkIndex=-1)
- Documents are chunked into ~1500 character segments
- Each chunk gets its own embedding (chunkIndex >= 0)
- Embeddings stored in MongoDB for semantic search
- Cosine similarity used for matching

**Metadata Normalization**:
- Skills normalized to lowercase, common synonyms handled
- Seniority levels mapped to numeric ranks
- Location data structured for filtering
- Experience calculated from date ranges

---

## Security & Authentication

### Authentication Flow

1. **Registration** (`POST /auth/register`):
   - Password hashed with bcrypt (salt rounds: 10)
   - User stored in MongoDB
   - JWT token generated and returned

2. **Login** (`POST /auth/login`):
   - Credentials verified against hashed password
   - JWT token generated with payload: `{ userId, email }`
   - Token expiration: 3600s (1 hour, configurable)

3. **Token Management**:
   - Frontend stores token in sessionStorage (default)
   - Can persist in localStorage (optional)
   - Token sent in Authorization header: `Bearer <token>`

4. **Protected Routes**:
   - `@UseGuards(JwtAuthGuard)` decorator on endpoints
   - Middleware validates token signature
   - Extracts user info from token payload
   - Attaches to request: `req.user`

### CORS Configuration

**Development Setup** (main.ts):
```typescript
app.enableCors({
  origin: true, // Allow all origins in dev
  credentials: true
});
```

**Production Recommendations**:
- Whitelist specific origins in `CORS_ORIGINS` env var
- Use `origin: process.env.CORS_ORIGINS.split(',')`
- Enable credentials for cookie-based auth

### File Upload Security

**CV Upload** (`/cv/upload`):
- File type validation: Only PDF allowed
- File size limit: Not explicitly set (should add)
- Filename sanitization: UUID + timestamp prefix
- Path traversal prevention: Uses path.join, checks for ".."
- Files stored in `./uploads/cvs/` directory

**Recommendations**:
- Add file size limit (e.g., 10MB)
- Scan for malware
- Use cloud storage (S3/GCS) for production
- Implement rate limiting

### API Security Best Practices

1. **Input Validation**:
   - DTOs with class-validator decorators
   - Type checking with TypeScript
   - Sanitization in services

2. **SQL/NoSQL Injection Prevention**:
   - Mongoose query methods (not raw queries)
   - Parameterized queries
   - Input validation before DB operations

3. **Rate Limiting**:
   - Not currently implemented
   - **Recommendation**: Add @nestjs/throttler

4. **Secret Management**:
   - Environment variables (.env file)
   - Secrets not committed to repo (.gitignore)
   - **Production**: Use secret managers (AWS Secrets Manager, etc.)

5. **HTTPS**:
   - Required in production
   - Current dev setup uses HTTP
   - ngrok provides HTTPS tunnel for testing

---

## Environment Configuration

### Frontend Environment Variables
```bash
# API endpoint (ngrok in dev, deployed URL in prod)
VITE_API_BASE_URL=https://your-api.ngrok-free.dev
```

### Backend (NestJS) Environment Variables
```bash
# Database
MONGO_URI=mongodb://localhost:27017/mydb

# Authentication
JWT_SECRET=your_super_secret_here
JWT_EXPIRES_IN=3600s

# Server
PORT=3000

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_COMPLETION_MODEL=gpt-4o-mini
OPENAI_MODEL=gpt-4o-mini

# CORS
CORS_ORIGINS=http://localhost:3001,https://...

# FastAPI Integration
FASTAPI_BASE_URL=http://localhost:8000
FASTAPI_TIMEOUT_MS=120000

# File Storage
LOCAL_CV_DIR=./uploads/cvs
```

### FastAPI Environment Variables
```python
# Google Gemini AI
GEMINI_API_KEY=your_gemini_key

# Mock mode for testing without API key
MOCK_GEMINI=0  # Set to 1 to enable mock mode
```

---

## Deployment Considerations

### Current Architecture Limitations
1. All embeddings stored in MongoDB (not ideal for large scale)
2. No caching layer (Redis recommended)
3. No message queue for async tasks
4. File storage on local filesystem
5. No containerization (Docker)

### Scaling Recommendations

**Database**:
- Consider vector database (Pinecone, Qdrant, Weaviate) for embeddings
- MongoDB Atlas for managed hosting
- Implement sharding for horizontal scaling

**Caching**:
- Redis for session storage
- Cache frequently accessed data
- Cache embedding results

**File Storage**:
- AWS S3 / Google Cloud Storage / Azure Blob
- CDN for static assets
- Separate storage service

**Microservices**:
- Containerize with Docker
- Kubernetes for orchestration
- Service mesh (Istio) for communication

**Message Queue**:
- RabbitMQ or Kafka for async jobs
- Separate indexing service
- Background job processing

**Monitoring & Logging**:
- ELK stack (Elasticsearch, Logstash, Kibana)
- Application Performance Monitoring (APM)
- Distributed tracing (Jaeger)

**Load Balancing**:
- Nginx or cloud load balancer
- Multiple NestJS instances
- Health checks and auto-scaling

---

## Development Workflow

### Local Development Setup

1. **Clone Repository**:
```bash
git clone <repo-url>
cd smart-job-connect
```

2. **Backend Setup**:
```bash
cd be
npm install
cp .env.example .env
# Edit .env with your credentials
npm run start:dev
```

3. **FastAPI Setup**:
```bash
cd ../fastApi-python
pip install -r requirements.txt
# Create config.py with GEMINI_API_KEY
uvicorn app:app --reload --port 8000
```

4. **Frontend Setup**:
```bash
cd ../fe
npm install
# Update API_BASE_URL in lib/api.ts
npm run dev
```

5. **MongoDB**:
```bash
# Start MongoDB locally or use MongoDB Atlas
mongod --dbpath=/path/to/data
```

### Testing the Integration

1. **Test FastAPI**:
```bash
curl -X POST http://localhost:8000/upload \
  -F "file=@test-resume.pdf"
```

2. **Test NestJS Auth**:
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

3. **Test CV Upload Flow**:
   - Login via frontend
   - Upload PDF resume
   - Check MongoDB for saved CV
   - Check embeddings collection for indexed data

4. **Test Matching**:
   - Create a job via API or frontend
   - Upload/create a CV
   - Call matching endpoint
   - Verify ranked results

---

## Key Design Patterns

### Backend Patterns

1. **Module Pattern** (NestJS):
   - Each feature is a module (Auth, CV, Job, RAG)
   - Modules encapsulate related functionality
   - Clear separation of concerns

2. **Service Layer Pattern**:
   - Controllers handle HTTP requests
   - Services contain business logic
   - Repositories (Mongoose models) handle data

3. **Dependency Injection**:
   - NestJS IoC container manages dependencies
   - Services injected via constructor
   - Testability and loose coupling

4. **Guard Pattern**:
   - JWT authentication via guards
   - Declarative route protection
   - Reusable security logic

5. **Interceptor Pattern**:
   - Request/response transformation
   - Logging and monitoring
   - Error handling

### Frontend Patterns

1. **Context API**:
   - AuthContext for authentication state
   - ModalContext for global modals
   - Avoid prop drilling

2. **Custom Hooks**:
   - Reusable stateful logic
   - Clean component code
   - Easy testing

3. **Route-based Code Splitting**:
   - Lazy loading with React.lazy
   - Improved initial load time
   - Vite handles bundling

4. **API Abstraction**:
   - Centralized Axios instance
   - Interceptors for auth
   - Consistent error handling

---

## Performance Optimizations

### Current Implementations

1. **Chunking Strategy**:
   - Documents split into ~1500 character chunks
   - Balances context vs. granularity
   - Reduces embedding costs

2. **Batch Processing**:
   - Index multiple CVs/jobs at once
   - Parallel embedding generation
   - Reduced latency

3. **Metadata Caching**:
   - Skills, experience, location pre-computed
   - Stored in embedding metadata
   - Avoid repeated calculations

4. **Pagination**:
   - API responses paginated
   - Default limits (10-100 items)
   - Reduced payload size

5. **Selective Field Projection**:
   - Mongoose select() for specific fields
   - Reduces document size
   - Faster queries

### Recommended Improvements

1. **Caching**:
   - Redis for embedding lookups
   - Cache matching results (TTL-based)
   - Session caching

2. **Database Indexes**:
   - Compound indexes for common queries
   - Text indexes for search
   - Geospatial indexes for location

3. **CDN**:
   - Static assets via CDN
   - Reduce server load
   - Global distribution

4. **Compression**:
   - gzip/brotli for HTTP responses
   - Reduce bandwidth
   - Faster page loads

5. **Lazy Loading**:
   - Frontend code splitting
   - Load components on demand
   - Reduced initial bundle

---

## Monitoring & Observability

### Logging

**Backend**:
- NestJS Logger used throughout
- Console output in development
- Should add structured logging (Winston/Pino)

**Frontend**:
- Console logging for debugging
- Should add error tracking (Sentry)

### Metrics (Not Implemented)

**Recommended**:
- Request rates and latencies
- Error rates by endpoint
- Database query performance
- Embedding generation time
- Matching algorithm metrics

### Health Checks (Not Implemented)

**Recommended**:
- `/health` endpoint
- Database connectivity
- External service availability
- Memory/CPU usage

---

## Conclusion

**Smart Job Connect** is a sophisticated AI-powered job matching platform that combines:
- Modern frontend (React + TypeScript)
- Robust backend (NestJS + MongoDB)
- AI-powered resume parsing (FastAPI + Gemini)
- Semantic search and matching (OpenAI + RAG)

The architecture follows best practices for separation of concerns, with clear boundaries between services. The RAG-based matching system provides intelligent, context-aware recommendations that go beyond simple keyword matching.

**Key Strengths**:
- Type-safe development (TypeScript throughout)
- Scalable architecture (microservices-ready)
- AI-powered intelligence (LLM + embeddings)
- Multi-language support (Vietnamese/English)
- Comprehensive data modeling

**Areas for Improvement**:
- Production-grade security hardening
- Scalable vector storage (dedicated vector DB)
- Performance optimization (caching, CDN)
- Comprehensive testing suite
- CI/CD pipeline
- Monitoring and observability
- Documentation and API specs (OpenAPI/Swagger)

This system demonstrates a modern, full-stack approach to building an intelligent recruitment platform, leveraging cutting-edge AI technologies to solve real-world matching problems.
