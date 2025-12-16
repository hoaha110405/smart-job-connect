# Smart Job Connect - Quick Reference Guide

## 📋 Overview

Smart Job Connect is an AI-powered job matching platform that connects job seekers with suitable positions using semantic search and machine learning algorithms.

## 🏗️ System Architecture (High-Level)

```
┌─────────────┐
│   React     │  User Interface
│  Frontend   │  (Port 3001)
└──────┬──────┘
       │ REST API
┌──────▼──────┐
│   NestJS    │  Business Logic
│   Backend   │  (Port 3000)
└──┬────────┬─┘
   │        │
   │        └─────────┐
   │                  │
┌──▼────────┐  ┌─────▼──────┐
│  FastAPI   │  │   OpenAI   │  AI Services
│  (Gemini)  │  │    API     │
└────────────┘  └────────────┘
       │              │
       └──────┬───────┘
              │
       ┌──────▼──────┐
       │   MongoDB   │  Data Storage
       └─────────────┘
```

## 🔑 Key Features

### 1. **Intelligent CV Parsing**
- Upload PDF resumes → Automatically extract structured data
- Uses Google Gemini AI for intelligent extraction
- Supports Vietnamese and English languages
- Preserves skills, experience, education, projects, certifications

### 2. **Semantic Job Matching**
- AI-powered matching using OpenAI embeddings (1536 dimensions)
- Hybrid scoring: 70% semantic similarity + 30% traditional criteria
- Factors: Skills overlap, Experience years, Seniority level, Location
- Real-time ranking with configurable thresholds

### 3. **RAG-Based Chatbot**
- Context-aware AI assistant
- Retrieves relevant CV/Job chunks before generating responses
- Cites sources in answers
- Powered by OpenAI GPT-4o-mini

### 4. **Multi-Language Support**
- Automatic Vietnamese detection
- On-the-fly translation to English for embedding
- Maintains original text for display

## 📊 Component Breakdown

### Frontend (`fe/`)
- **Technology**: React 19.2, TypeScript, Vite
- **Features**:
  - User authentication (login/register)
  - Job browsing with filters
  - Candidate browsing with matching scores
  - CV upload and profile management
  - AI chatbot integration
- **Key Files**:
  - `lib/api.ts` - Axios client with JWT interceptors
  - `contexts/AuthContext.tsx` - Authentication state management
  - `pages/` - Main application pages

### Backend (`be/`)
- **Technology**: NestJS 11, TypeScript, MongoDB
- **Modules**:
  - **Auth Module**: JWT authentication, password hashing
  - **CV Module**: Resume CRUD, file upload, FastAPI integration
  - **Job Module**: Job posting management
  - **RAG Module**: ⭐ Core intelligence - embeddings, matching, chatbot
- **Key Services**:
  - `cv.service.ts` - CV management, FastAPI communication
  - `rag.service.ts` - Embedding generation, semantic search, matching
  - `openai.service.ts` - OpenAI API wrapper

### FastAPI Service (`fastApi-python/`)
- **Technology**: FastAPI, Python, Gemini AI
- **Purpose**: Resume parsing and extraction
- **Process**:
  1. Receive PDF/image upload
  2. Extract text (PyMuPDF for PDF, Tesseract for images)
  3. Send to Gemini with strict JSON schema
  4. Validate and normalize output
  5. Return structured CV data

## 🔄 Data Flow Examples

### CV Upload Flow
```
User uploads PDF
    ↓
Frontend sends to NestJS /cv/upload
    ↓
NestJS forwards to FastAPI /upload
    ↓
FastAPI extracts text → Gemini AI parses
    ↓
FastAPI returns structured data
    ↓
NestJS saves to MongoDB
    ↓
NestJS triggers RAG indexing (async)
    ↓
RAG creates embeddings via OpenAI
    ↓
Embeddings stored in MongoDB
```

### Job Matching Flow
```
User views job details
    ↓
Frontend requests /rag/match-all-cvs-for-job-doc/:jobId
    ↓
NestJS RAG service:
  1. Fetches job embedding (or creates if missing)
  2. Fetches all CV embeddings from MongoDB
  3. For each CV:
     - Calculate cosine similarity (semantic)
     - Extract metadata (skills, exp, location)
     - Calculate non-semantic scores
     - Combine: 0.7 * semantic + 0.3 * non_semantic
     - Apply filters (min thresholds)
  4. Sort by score descending
  5. Apply pagination
    ↓
Return ranked CV list with scores
    ↓
Frontend displays matched candidates
```

## 🗄️ Database Schema

### Collections

1. **users**
   - `_id`, `email`, `password` (hashed), `role`

2. **cvs**
   - Personal info, skills, experiences, education, projects
   - File metadata (path, size, type)
   - Linked to user via `createdBy`

3. **jobs**
   - Title, company, description, requirements
   - Skills, experience needed, salary range
   - Location info, remote options

4. **embeddings**
   - `sourceType`: "cv" or "job"
   - `sourceId`: Reference to CV/Job
   - `chunkIndex`: -1 for doc-level, >=0 for chunks
   - `embedding`: 1536-dim vector from OpenAI
   - `metadata`: Pre-computed data for fast matching

## 🔐 Security

- **Authentication**: JWT tokens (1 hour expiry)
- **Password**: Bcrypt hashing (10 salt rounds)
- **Authorization**: Guards on protected routes (`@UseGuards(JwtAuthGuard)`)
- **File Upload**: PDF only, size limits, path traversal prevention
- **CORS**: Configurable origins, credentials support

## 📈 Matching Algorithm

### Scoring Formula
```
For each Job-CV pair:

1. Semantic Score (0-1):
   cosine_similarity(job_embedding, cv_embedding)

2. Skills Score (0-1):
   matched_skills / total_required_skills

3. Experience Score (0-1):
   min(1, candidate_years / required_years)

4. Seniority Score (0-1):
   1 - (rank_difference / job_rank)

5. Location Score (0-1):
   both_remote: 1.0
   same_city: 1.0
   same_country: 0.9
   else: 0.4-0.7

6. Non-Semantic Combined:
   0.6 * skills + 0.2 * exp + 0.1 * seniority + 0.1 * location

7. Final Score:
   0.7 * semantic + 0.3 * non_semantic

8. Filters:
   - semantic >= 0.45
   - final >= 0.5
   - skills >= 0.2 (if job has skills)
```

## 🚀 Getting Started

### Prerequisites
- Node.js (for frontend & backend)
- Python 3.x (for FastAPI)
- MongoDB
- OpenAI API key
- Google Gemini API key

### Quick Setup

1. **Backend**:
```bash
cd be
npm install
cp .env.example .env
# Edit .env with your API keys
npm run start:dev
```

2. **FastAPI**:
```bash
cd fastApi-python
pip install -r requirements.txt
# Create config.py with GEMINI_API_KEY
uvicorn app:app --reload --port 8000
```

3. **Frontend**:
```bash
cd fe
npm install
# Update API_BASE_URL in lib/api.ts
npm run dev
```

4. **MongoDB**:
```bash
mongod --dbpath=/path/to/data
```

## 📝 API Endpoints (Quick Reference)

### Authentication
- `POST /auth/register` - Create account
- `POST /auth/login` - Get JWT token

### CV Management
- `POST /cv` - Create CV
- `GET /cv` - List CVs (with filters)
- `POST /cv/upload` - Upload PDF resume
- `GET /cv/user/me` - Get my CVs

### Job Management
- `POST /job` - Create job
- `GET /job` - List jobs (with filters)
- `GET /job/:id` - Get job details

### Matching & Search
- `GET /rag/match-all-cvs-for-job-doc/:jobId` - Find CVs for job
- `GET /rag/match-all-jobs-for-cv-doc/:cvId` - Find jobs for CV
- `GET /rag/match-job-cv-chunks/:jobId/:cvId` - Detailed chunk matching
- `POST /rag/ask` - AI chatbot Q&A
- `GET /rag/retrieve` - Semantic search

### Indexing
- `POST /rag/index-cv/:id` - Index single CV
- `POST /rag/index-all-cv` - Index all CVs
- `POST /rag/index-job/:id` - Index single job
- `POST /rag/index-all-job` - Index all jobs

## 🔧 Configuration

### Environment Variables

**Backend (.env)**:
```bash
MONGO_URI=mongodb://localhost:27017/mydb
JWT_SECRET=your_secret_key
OPENAI_API_KEY=sk-...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_COMPLETION_MODEL=gpt-4o-mini
FASTAPI_BASE_URL=http://localhost:8000
PORT=3000
```

**FastAPI (config.py)**:
```python
GEMINI_API_KEY = "your_gemini_key"
```

**Frontend (lib/api.ts)**:
```typescript
const API_BASE_URL = "http://localhost:3000";
```

## 🎯 Use Cases

### For Job Seekers
1. Upload CV (PDF) → Automatically parsed
2. Browse jobs → See match scores for your profile
3. Filter by skills, location, salary
4. Ask chatbot: "Find me React jobs in SF"

### For Employers
1. Post job requirements
2. Browse candidates → See match scores for your job
3. Filter by skills, experience, location
4. View detailed chunk-level matching

### For Recruiters
1. Search semantic: "senior backend engineer with kubernetes"
2. AI assistant answers: "Who has 5+ years experience?"
3. Compare candidates side-by-side with scores

## 📊 Performance Tips

### Current Optimizations
- Document chunking (~1500 chars)
- Batch embedding generation
- Metadata caching in embeddings
- Pagination on all list endpoints
- Selective field projection in queries

### Recommendations
- Add Redis for caching embeddings
- Use vector database (Pinecone/Qdrant) for large scale
- Implement rate limiting
- Add CDN for static assets
- Enable gzip compression

## 🐛 Troubleshooting

### Common Issues

**1. "Network Error" in frontend**
- Check API_BASE_URL in `fe/lib/api.ts`
- Ensure NestJS backend is running on correct port
- Verify CORS configuration

**2. "Failed to upload CV"**
- Check FastAPI is running on port 8000
- Verify FASTAPI_BASE_URL in backend .env
- Ensure GEMINI_API_KEY is set

**3. "No matches found"**
- Run indexing: `POST /rag/index-all-cv` and `/rag/index-all-job`
- Check OpenAI API key is valid
- Verify embeddings collection has documents

**4. "JWT token expired"**
- Re-login to get fresh token
- Check JWT_EXPIRES_IN setting (default 3600s)

## 📚 Documentation Files

- **ARCHITECTURE.md** - Full system architecture (35KB, detailed)
- **DATA_FLOW.md** - Data flow diagrams (46KB, visual)
- **README.md** - This quick reference guide

## 🎓 Learning Resources

### Technologies Used
- [NestJS Docs](https://docs.nestjs.com/)
- [React Docs](https://react.dev/)
- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [OpenAI API](https://platform.openai.com/docs)
- [Google Gemini AI](https://ai.google.dev/)
- [MongoDB Docs](https://docs.mongodb.com/)

### Concepts
- **RAG** (Retrieval-Augmented Generation)
- **Vector Embeddings** for semantic search
- **JWT Authentication**
- **Microservices Architecture**

## 🤝 Contributing

When making changes:
1. Understand the architecture (read ARCHITECTURE.md)
2. Follow data flow patterns (see DATA_FLOW.md)
3. Test CV upload → Parsing → Indexing → Matching pipeline
4. Update documentation if adding new features

## 📞 Support

For issues or questions:
1. Check troubleshooting section above
2. Review detailed documentation (ARCHITECTURE.md)
3. Examine data flows (DATA_FLOW.md)
4. Check API endpoints in code

---

**Last Updated**: 2024-01-01  
**Documentation Version**: 1.0  
**System Version**: See package.json files in each directory
