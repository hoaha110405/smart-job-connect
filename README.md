# Smart Job Connect

Hệ thống kết nối việc làm thông minh sử dụng AI để matching ứng viên và công việc thông qua semantic search và RAG (Retrieval-Augmented Generation).

## Demo / Screenshot

*(Repository hiện chưa có ảnh demo, có thể bổ sung sau)*

## Tính năng chính

- 🔐 **Xác thực người dùng**: Đăng ký/đăng nhập với JWT authentication
- 📄 **Quản lý CV**: Upload PDF, tự động parse thông tin, lưu trữ và tìm kiếm CV
- 💼 **Quản lý Job**: Tạo, sửa, xóa và tìm kiếm job posting
- 🤖 **AI Matching**: Sử dụng vector embeddings (OpenAI + Pinecone) để match CV với Job phù hợp
- 💬 **Chatbot AI**: Hỏi đáp thông tin về CV và Job thông qua RAG
- 🔍 **Semantic Search**: Tìm kiếm CV/Job dựa trên ngữ nghĩa, không chỉ keyword
- 📊 **Chunk-level Matching**: So khớp chi tiết từng phần của CV với yêu cầu Job

## Kiến trúc tổng quan

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Frontend      │ ◄─────► │   Backend        │ ◄─────► │   FastAPI       │
│   (React/Vite)  │         │   (NestJS)       │         │   (Python)      │
│   Port: 3000    │         │   Port: 3000     │         │   Port: 8000    │
└─────────────────┘         └──────────────────┘         └─────────────────┘
                                     │                            │
                                     ▼                            ▼
                            ┌──────────────────┐         ┌─────────────────┐
                            │   MongoDB        │         │   OCR / Parse   │
                            │   (Database)     │         │   (PyMuPDF,     │
                            └──────────────────┘         │   Tesseract)    │
                                     │                    └─────────────────┘
                                     ▼
                            ┌──────────────────┐
                            │   Pinecone       │
                            │   (Vector DB)    │
                            └──────────────────┘
```

### Luồng hoạt động chính:

1. **Đăng ký/Đăng nhập**: User tạo tài khoản → Backend tạo JWT token → Client lưu token
2. **Upload CV**: 
   - User upload PDF → Backend nhận file → Forward tới FastAPI
   - FastAPI parse PDF (OCR) → Trả về JSON structured data
   - Backend lưu vào MongoDB → Tạo embedding → Index vào Pinecone
3. **Tạo Job**: User tạo job → Backend lưu MongoDB → Tạo embedding → Index vào Pinecone
4. **Matching**: 
   - Query job/cv → Backend tìm kiếm vector tương tự trong Pinecone
   - Lấy top-K kết quả → So sánh skills, experience → Trả về match score
5. **Chatbot**: User hỏi → Backend tìm context liên quan qua RAG → OpenAI generate câu trả lời

## Công nghệ sử dụng

### Frontend
- **React** 19.2.0 - UI framework
- **Vite** 6.2.0 - Build tool & dev server
- **TypeScript** 5.8.2 - Type safety
- **React Router DOM** 6.22.3 - Routing
- **Axios** 1.6.0 - HTTP client
- **React Hook Form** 7.68.0 - Form handling
- **Lucide React** 0.555.0 - Icons

### Backend
- **NestJS** 11.0.1 - Node.js framework
- **MongoDB** (Mongoose 8.20.1) - Database
- **JWT** (@nestjs/jwt 11.0.1) - Authentication
- **Passport** 0.7.0 - Auth middleware
- **bcryptjs** 3.0.3 - Password hashing
- **Multer** 2.0.2 - File upload
- **OpenAI** 4.104.0 - LLM và embeddings
- **Pinecone** 6.1.3 - Vector database
- **pdf-parse** 2.4.5 - PDF parsing

### Python Service (FastAPI)
- **FastAPI** - Web framework
- **uvicorn** - ASGI server
- **PyMuPDF** (fitz) - PDF processing
- **pytesseract** - OCR
- **celery** + **redis** - Task queue
- **python-multipart** - File upload

### Database & AI
- **MongoDB** - Document database cho users, CVs, jobs
- **Pinecone** - Vector database cho semantic search
- **OpenAI API** - text-embedding-3-small, gpt-4o-mini

## Yêu cầu hệ thống

- **Node.js**: ≥ 18.x (khuyến nghị 20.x)
- **npm** hoặc **yarn**
- **MongoDB**: ≥ 6.0 (local hoặc MongoDB Atlas)
- **Python**: 3.9+ (cho FastAPI service)
- **Tesseract OCR**: Cài đặt trên hệ thống (cho Python service)
- **Redis** (optional): Nếu dùng celery task queue

## Cài đặt & chạy local

### 1. Clone repository

```bash
git clone https://github.com/hoaha110405/smart-job-connect.git
cd smart-job-connect
```

### 2. Cài đặt Backend (NestJS)

```bash
cd be
npm install
```

Tạo file `.env` từ `.env.example`:

```bash
cp .env.example .env
```

Cấu hình các biến môi trường trong `.env` (xem mục **Cấu hình môi trường** bên dưới).

### 3. Cài đặt Frontend (React/Vite)

```bash
cd ../fe
npm install
```

Tạo file `.env` (nếu cần):

```bash
# Tùy chọn, frontend có thể lấy từ vite.config.ts
echo "GEMINI_API_KEY=your_gemini_key_here" > .env
```

### 4. Cài đặt FastAPI service (Python)

```bash
cd ../fastApi-python
pip install -r requirements.txt
```

Cài đặt Tesseract OCR trên hệ thống:

**Ubuntu/Debian:**
```bash
sudo apt-get install tesseract-ocr
```

**macOS:**
```bash
brew install tesseract
```

**Windows:** Download từ [GitHub Tesseract](https://github.com/UB-Mannheim/tesseract/wiki)

### 5. Chạy MongoDB

Đảm bảo MongoDB đang chạy:

```bash
# Nếu cài local
mongod

# Hoặc sử dụng MongoDB Atlas (connection string trong .env)
```

### 6. Chạy các service

**Terminal 1 - Backend:**
```bash
cd be
npm run start:dev
```
Backend sẽ chạy tại `http://localhost:3000`

**Terminal 2 - Frontend:**
```bash
cd fe
npm run dev
```
Frontend sẽ chạy tại `http://localhost:3000` (Vite dev server)

**Terminal 3 - FastAPI:**
```bash
cd fastApi-python
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```
FastAPI sẽ chạy tại `http://localhost:8000`

### 7. Truy cập ứng dụng

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:3000` (base URL)
- FastAPI docs: `http://localhost:8000/docs`

## Cấu hình môi trường

### Backend (.env)

Tạo file `be/.env` với nội dung:

```env
# ===============================
# Database
# ===============================
MONGO_URI=mongodb://localhost:27017/mydb
# Hoặc MongoDB Atlas: mongodb+srv://user:pass@cluster.mongodb.net/dbname

# ===============================
# Authentication (JWT)
# ===============================
JWT_SECRET=your_super_secret_here
# String bí mật để ký JWT token, nên đổi thành random string dài
JWT_EXPIRES_IN=3600s
# Thời gian hết hạn token (3600s = 1 giờ)

# ===============================
# Server
# ===============================
PORT=3000
# Port cho NestJS backend

# ===============================
# OpenAI Configuration
# ===============================
OPENAI_API_KEY=sk-your-api-key-here
# API key từ platform.openai.com

OPENAI_EMBEDDING_MODEL=text-embedding-3-small
# Model dùng để tạo embeddings

OPENAI_COMPLETION_MODEL=gpt-4o-mini
# Model dùng cho chatbot/completion

OPENAI_MODEL=gpt-4o-mini
# Fallback model name

# ===============================
# CORS
# ===============================
CORS_ORIGINS=http://localhost:3000,https://your-frontend-domain.com
# Danh sách origins được phép gọi API

# ===============================
# FastAPI Service
# ===============================
FASTAPI_BASE_URL=http://localhost:8000
# URL của Python service để parse CV

FASTAPI_TIMEOUT_MS=120000
# Timeout cho request tới FastAPI (120 giây)

# ===============================
# Pinecone (Vector Database) - (cần bổ sung)
# ===============================
# PINECONE_API_KEY=your-pinecone-api-key
# PINECONE_ENVIRONMENT=your-environment
# PINECONE_INDEX_NAME=smart-job-connect

# ===============================
# Local file storage
# ===============================
# LOCAL_CV_DIR=./uploads/cvs
# Thư mục lưu trữ CV uploads
```

### Frontend (.env hoặc vite.config.ts)

Frontend có thể cấu hình qua `fe/.env`:

```env
# Gemini API Key (nếu dùng Google AI)
GEMINI_API_KEY=your_gemini_api_key_here
```

**Lưu ý:** Frontend đang config trong `vite.config.ts` để đọc `GEMINI_API_KEY` từ `.env` và inject vào `process.env`.

### Python Service (config.py)

File `fastApi-python/config.py`:

```python
GEMINI_API_KEY = ""
```

Hiện tại file này chỉ có placeholder. Nếu cần, bổ sung các biến cấu hình khác.

## Scripts

### Backend (be/)

```bash
# Development
npm run start:dev      # Chạy dev mode với hot-reload
npm run start          # Chạy production mode
npm run start:debug    # Chạy debug mode

# Build
npm run build          # Build production

# Testing
npm run test           # Unit tests
npm run test:e2e       # End-to-end tests
npm run test:cov       # Test coverage

# Linting
npm run lint           # ESLint check và fix
npm run format         # Format code với Prettier
```

### Frontend (fe/)

```bash
npm run dev            # Chạy Vite dev server (port 3000)
npm run build          # Build production
npm run preview        # Preview production build
```

### Python Service (fastApi-python/)

```bash
# Chạy server
uvicorn app:app --reload --host 0.0.0.0 --port 8000

# Hoặc với gunicorn (production)
gunicorn -w 4 -k uvicorn.workers.UvicornWorker app:app
```

## Cấu trúc thư mục

```
smart-job-connect/
├── be/                          # Backend NestJS
│   ├── src/
│   │   ├── auth/               # Authentication module (JWT, Passport)
│   │   │   ├── auth.controller.ts    # /auth/register, /auth/login
│   │   │   ├── auth.service.ts
│   │   │   ├── jwt.strategy.ts
│   │   │   └── jwt-auth.guard.ts
│   │   ├── users/              # User management
│   │   │   ├── schemas/user.schema.ts  # User model (email, password)
│   │   │   └── users.service.ts
│   │   ├── modules/
│   │   │   ├── cv/            # CV management
│   │   │   │   ├── cv.controller.ts    # CRUD CV, upload PDF
│   │   │   │   ├── cv.service.ts       # CV logic, FastAPI integration
│   │   │   │   └── schemas/cv.schema.ts # CV model
│   │   │   ├── job/           # Job posting management
│   │   │   │   ├── job.controller.ts   # CRUD jobs
│   │   │   │   ├── job.service.ts
│   │   │   │   └── schemas/job.schema.ts
│   │   │   └── rag/           # RAG (Retrieval-Augmented Generation)
│   │   │       ├── rag.controller.ts   # /rag/ask, /rag/match-*
│   │   │       ├── rag.service.ts      # Vector search, matching
│   │   │       ├── openai.service.ts   # OpenAI API wrapper
│   │   │       └── schemas/embedding.schema.ts
│   │   ├── utils/             # Utility functions
│   │   ├── app.module.ts      # Root module
│   │   └── main.ts            # Entry point, CORS config
│   ├── uploads/cvs/           # Uploaded CV files
│   ├── .env.example           # Environment variables template
│   └── package.json
├── fe/                          # Frontend React/Vite
│   ├── components/
│   │   ├── common/            # Shared components
│   │   ├── modals/            # Modal components
│   │   ├── profile/           # Profile-related components
│   │   ├── search/            # Search components
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   ├── Chatbot.tsx        # AI chatbot UI
│   │   ├── CvCard.tsx
│   │   └── ...
│   ├── pages/
│   │   ├── Home.tsx           # Landing page
│   │   ├── Login.tsx          # Login page
│   │   ├── Register.tsx       # Register page
│   │   ├── Jobs.tsx           # Job listing
│   │   ├── JobDetail.tsx      # Job detail
│   │   ├── Candidates.tsx     # CV listing
│   │   ├── CandidateDetail.tsx
│   │   ├── CreateProfile.tsx  # Create CV form
│   │   └── ProfilePage.tsx
│   ├── contexts/
│   │   ├── AuthContext.tsx    # Authentication state
│   │   └── ModalContext.tsx
│   ├── hooks/                 # Custom React hooks
│   ├── lib/
│   │   └── api.ts             # Axios API client
│   ├── utils/                 # Utility functions
│   ├── App.tsx                # Root component
│   ├── index.tsx              # Entry point
│   ├── vite.config.ts         # Vite configuration
│   └── package.json
└── fastApi-python/              # Python CV parser service
    ├── data/
    │   ├── uploads/           # Temporary upload storage
    │   └── results/           # Processing results
    ├── app.py                 # FastAPI app, /upload endpoint
    ├── parser.py              # CV parsing logic (OCR, extraction)
    ├── config.py              # Configuration
    ├── requirements.txt       # Python dependencies
    └── Dockerfile             # Docker container config
```

## API Endpoints

### Base URL

- Backend: `http://localhost:3000`
- FastAPI: `http://localhost:8000`

### Authentication

#### POST `/auth/register`
Đăng ký tài khoản mới.

**Request:**
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "your_password",
    "name": "User Name"
  }'
```

**Response:**
```json
{
  "id": "user_id",
  "email": "user@example.com",
  "name": "User Name"
}
```

#### POST `/auth/login`
Đăng nhập và nhận JWT token.

**Request:**
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "your_password"
  }'
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

#### GET `/auth/profile`
Lấy thông tin user hiện tại (yêu cầu JWT token).

**Request:**
```bash
curl -X GET http://localhost:3000/auth/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### CV Management

#### POST `/cv/upload`
Upload CV dạng PDF (yêu cầu authentication).

**Request:**
```bash
curl -X POST http://localhost:3000/cv/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/cv.pdf"
```

**Response:**
```json
{
  "message": "Uploaded and created CV successfully",
  "cv": {
    "id": "cv_id",
    "fullname": "Nguyen Van A",
    "email": "nguyenvana@email.com",
    "skills": [...],
    ...
  },
  "filename": "1234567890-cv.pdf"
}
```

#### GET `/cv`
Lấy danh sách CV (có phân trang).

**Request:**
```bash
curl -X GET "http://localhost:3000/cv?page=1&limit=20&search=developer"
```

#### GET `/cv/:id`
Lấy chi tiết CV theo ID.

**Request:**
```bash
curl -X GET http://localhost:3000/cv/cv_id_here
```

#### GET `/cv/user/me`
Lấy danh sách CV của user hiện tại (yêu cầu authentication).

**Request:**
```bash
curl -X GET http://localhost:3000/cv/user/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### PUT `/cv/:id`
Cập nhật CV.

#### DELETE `/cv/:id`
Xóa CV.

### Job Management

#### POST `/jobs`
Tạo job mới (yêu cầu authentication).

**Request:**
```bash
curl -X POST http://localhost:3000/jobs \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Senior Backend Developer",
    "companyId": "company_123",
    "companyName": "Tech Corp",
    "description": "We are looking for...",
    "skills": [
      {"name": "Node.js", "level": "advanced"},
      {"name": "MongoDB", "level": "intermediate"}
    ],
    "location": {
      "city": "Ho Chi Minh",
      "country": "Vietnam"
    }
  }'
```

#### GET `/jobs`
Lấy danh sách jobs (có phân trang).

**Request:**
```bash
curl -X GET "http://localhost:3000/jobs?page=1&limit=20&search=developer"
```

#### GET `/jobs/:id`
Lấy chi tiết job theo ID.

**Request:**
```bash
curl -X GET http://localhost:3000/jobs/job_id_here
```

#### GET `/jobs/user/me`
Lấy danh sách jobs của user hiện tại.

#### PUT `/jobs/:id`
Cập nhật job.

#### DELETE `/jobs/:id`
Xóa job.

### RAG & Matching

#### POST `/rag/ask`
Hỏi chatbot về CV hoặc Job (RAG).

**Request:**
```bash
curl -X POST http://localhost:3000/rag/ask \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Tìm CV phù hợp với vị trí Backend Developer có kinh nghiệm Node.js",
    "topK": 5
  }'
```

**Response:**
```json
{
  "answer": "Dựa trên dữ liệu hiện có, tôi tìm thấy 5 CV phù hợp...",
  "contexts": [...]
}
```

#### GET `/rag/match-all-cvs-for-job-doc/:jobId`
Tìm tất cả CV phù hợp với một Job (dựa trên document-level embedding).

**Request:**
```bash
curl -X GET "http://localhost:3000/rag/match-all-cvs-for-job-doc/job_id?topK=50&page=1&limit=10"
```

**Response:**
```json
{
  "jobId": "job_id",
  "total": 50,
  "page": 1,
  "limit": 10,
  "results": [
    {
      "cvId": "cv_id_1",
      "score": 0.85,
      "cv": {...}
    },
    ...
  ]
}
```

#### GET `/rag/match-all-jobs-for-cv-doc/:cvId`
Tìm tất cả Jobs phù hợp với một CV.

**Request:**
```bash
curl -X GET "http://localhost:3000/rag/match-all-jobs-for-cv-doc/cv_id?topK=50&page=1&limit=10"
```

#### GET `/rag/match-job-cv-chunks/:jobId/:cvId`
So khớp chi tiết chunk-level giữa một Job và một CV.

**Request:**
```bash
curl -X GET "http://localhost:3000/rag/match-job-cv-chunks/job_id/cv_id?topK=10&minScore=0.7"
```

**Response:**
```json
{
  "jobId": "job_id",
  "cvId": "cv_id",
  "overallScore": 0.78,
  "topMatches": [
    {
      "jobChunk": "Require 3+ years Node.js experience",
      "cvChunk": "5 years experience in Node.js and Express",
      "score": 0.92,
      "skillOverlap": ["Node.js"]
    },
    ...
  ]
}
```

#### POST `/rag/index-cv/:id`
Index một CV vào Pinecone (tạo embeddings).

#### POST `/rag/index-job/:id`
Index một Job vào Pinecone.

#### POST `/rag/index-all-cv`
Index tất cả CVs vào Pinecone.

#### POST `/rag/index-all-job`
Index tất cả Jobs vào Pinecone.

### FastAPI (Python Service)

#### POST `/upload`
Upload CV file để parse (PDF/Image).

**Request:**
```bash
curl -X POST http://localhost:8000/upload \
  -F "file=@/path/to/cv.pdf"
```

**Response:**
```json
{
  "cv_id": "uuid",
  "status": "done",
  "result": {
    "fullname": "Nguyen Van A",
    "email": "nguyenvana@email.com",
    "phone": "+84123456789",
    "skills": [...],
    "experiences": [...],
    ...
  }
}
```

## Troubleshooting

### 1. Lỗi "Cannot connect to MongoDB"

**Nguyên nhân:** MongoDB chưa chạy hoặc connection string sai.

**Giải pháp:**
- Kiểm tra MongoDB đang chạy: `sudo systemctl status mongod` (Linux) hoặc `brew services list` (macOS)
- Kiểm tra `MONGO_URI` trong `be/.env` đúng với MongoDB instance của bạn
- Nếu dùng MongoDB Atlas, kiểm tra whitelist IP và connection string

### 2. Lỗi "CORS policy"

**Nguyên nhân:** Frontend gọi API từ origin không được phép.

**Giải pháp:**
- Kiểm tra `CORS_ORIGINS` trong `be/.env` có chứa frontend URL (`http://localhost:3000`)
- Backend đã có CORS middleware trong `main.ts`, đảm bảo nó enable đúng cách

### 3. Port đã được sử dụng

**Nguyên nhân:** Port 3000 hoặc 8000 đã có service khác chạy.

**Giải pháp:**
- Đổi port trong config:
  - Backend: Sửa `PORT` trong `be/.env`
  - Frontend: Sửa `server.port` trong `fe/vite.config.ts`
  - FastAPI: Chạy với `--port 8001`
- Hoặc kill process đang dùng port:
  ```bash
  # Linux/macOS
  lsof -ti:3000 | xargs kill
  
  # Windows
  netstat -ano | findstr :3000
  taskkill /PID <PID> /F
  ```

### 4. Lỗi "OpenAI API key not found"

**Nguyên nhân:** Chưa cấu hình `OPENAI_API_KEY`.

**Giải pháp:**
- Lấy API key từ [platform.openai.com](https://platform.openai.com)
- Thêm vào `be/.env`: `OPENAI_API_KEY=sk-...`

### 5. Lỗi FastAPI "File parsing failed"

**Nguyên nhân:** 
- Tesseract OCR chưa được cài đặt
- File PDF bị corrupt hoặc format không hỗ trợ

**Giải pháp:**
- Cài đặt Tesseract OCR (xem mục cài đặt)
- Kiểm tra file PDF có mở được bằng PDF reader thông thường không
- Xem log FastAPI để biết chi tiết lỗi

### 6. Lỗi "JWT token invalid"

**Nguyên nhân:** Token hết hạn hoặc `JWT_SECRET` không khớp.

**Giải pháp:**
- Login lại để lấy token mới
- Đảm bảo `JWT_SECRET` trong `.env` không thay đổi giữa các lần restart server

### 7. Lỗi "Cannot find module" khi chạy backend

**Nguyên nhân:** Dependencies chưa được cài đặt đầy đủ.

**Giải pháp:**
```bash
cd be
rm -rf node_modules package-lock.json
npm install
```

### 8. Pinecone vector search không hoạt động

**Nguyên nhân:** Chưa cấu hình Pinecone API key hoặc index chưa được tạo.

**Giải pháp:**
- Đăng ký tài khoản Pinecone tại [pinecone.io](https://www.pinecone.io)
- Tạo index với dimension phù hợp (text-embedding-3-small = 1536 dimensions)
- Thêm Pinecone config vào `be/.env` (cần bổ sung vào code nếu chưa có)

## Thông tin cần bổ sung

Một số phần cấu hình chưa rõ ràng trong code và cần kiểm tra/bổ sung:

1. **Pinecone configuration**: Code có import `@pinecone-database/pinecone` nhưng không thấy env vars trong `.env.example`. Cần thêm:
   - `PINECONE_API_KEY`
   - `PINECONE_ENVIRONMENT`
   - `PINECONE_INDEX_NAME`

2. **Gemini API**: Frontend có config `GEMINI_API_KEY` nhưng chưa rõ chức năng cụ thể.

3. **Celery & Redis**: Python service có dependencies nhưng code chưa sử dụng, có thể cần cho background tasks.

## License

Dự án này sử dụng license UNLICENSED (xem `be/package.json`). 

*(Nếu muốn open-source, nên thêm file LICENSE với MIT, Apache 2.0, hoặc GPL)*

## Đóng góp

Để đóng góp vào dự án:

1. Fork repository
2. Tạo branch mới: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -m 'Add some feature'`
4. Push to branch: `git push origin feature/your-feature`
5. Tạo Pull Request

### Coding conventions

- **Backend**: Sử dụng ESLint và Prettier config có sẵn, chạy `npm run lint` và `npm run format` trước khi commit
- **Frontend**: Follow React best practices, sử dụng TypeScript strict mode
- **Python**: Follow PEP 8, sử dụng type hints khi có thể

---

**Ghi chú:** README này được tạo dựa trên phân tích source code hiện tại. Một số tính năng có thể đang trong quá trình phát triển hoặc cần bổ sung cấu hình thêm.
