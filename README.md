# Smart Job Connect

Nền tảng kết nối việc làm với quản lý CV/Job và matching ứng viên - công việc, kèm dịch vụ parse CV bằng FastAPI.

## Ghi chú nhanh (port, lệnh chạy, service chính)
- Service chính: FE (React + Vite), BE (NestJS + MongoDB + RAG/OpenAI), FastAPI (Python parse CV).
- Port mặc định: FE `3000` (Vite), BE `3000` (NestJS, từ `.env.example`), FastAPI `8000` (Dockerfile).
- Lệnh chạy nhanh:
  - FE: `cd fe && npm install && npm run dev`
  - BE: `cd be && npm install && cp .env.example .env && npm run start:dev`
  - FastAPI: `cd fastApi-python && pip install -r requirements.txt && uvicorn app:app --host 0.0.0.0 --port 8000`

## 1) Tên dự án + mô tả ngắn
**Smart Job Connect** là hệ thống quản lý CV/Job và matching ứng viên - công việc, gồm frontend React, backend NestJS và một dịch vụ FastAPI để parse CV từ PDF/ảnh.

## 2) Tổng quan / Kiến trúc (FE/BE/DB) + luồng auth
- **FE**: `fe/` (React + Vite). Gọi API BE qua Axios (`fe/lib/api.ts`) và fetch wrapper (`fe/src/api/http.ts`).
- **BE**: `be/` (NestJS + Mongoose). Cung cấp API auth, quản lý Job/CV, matching (RAG) và tích hợp FastAPI parse CV.
- **DB**: MongoDB (Mongoose). Lưu user, job, cv, embeddings.
- **FastAPI**: `fastApi-python/` parse CV (PDF/ảnh) bằng OCR/LLM, trả về schema CV để BE lưu.

**Luồng auth (JWT Bearer)**
1. FE gọi `POST /auth/register` hoặc `POST /auth/login`.
2. BE trả về `accessToken`.
3. FE lưu token (`localStorage`/`sessionStorage` trong `fe/lib/api.ts`) và gửi `Authorization: Bearer <token>` cho các endpoint cần bảo vệ (JWT Guard).

## 3) Tính năng chính
- Đăng ký/đăng nhập và lấy thông tin profile.
- CRUD Job (tạo, sửa, xóa, xem danh sách, xem chi tiết).
- CRUD CV (tạo, sửa, xóa, xem danh sách, xem chi tiết).
- Upload CV PDF -> BE forward sang FastAPI để parse -> lưu vào MongoDB.
- Tìm kiếm CV theo từ khóa (name/skills/headline/...)
- RAG + matching giữa CV và Job (doc-level + chunk-level) qua OpenAI embeddings.
- Tải file CV đã upload.

## 4) Công nghệ sử dụng
- **Frontend**: React 19, Vite, TypeScript, React Router, Axios, React Hook Form.
- **Backend**: NestJS, Mongoose (MongoDB), JWT/Passport, Multer (upload), OpenAI SDK.
- **FastAPI**: FastAPI, Uvicorn, PyMuPDF (fitz), Tesseract OCR, python-multipart.
- **Khác**: dotenv, bcryptjs.

## 5) Yêu cầu hệ thống
- **Node.js**: (chưa thấy cấu hình version cụ thể trong repo) (cần bổ sung).
- **MongoDB**: cần chạy local hoặc remote, cấu hình qua `MONGO_URI`.
- **Python**: 3.11+ (Dockerfile dùng `python:3.11-slim`).
- **OCR/PDF** (cho FastAPI): `tesseract-ocr`, `poppler-utils` (có trong Dockerfile).

## 6) Cài đặt & chạy local

### Backend (NestJS)
```bash
cd be
npm install
cp .env.example .env
# chỉnh các biến trong .env
npm run start:dev
```

### Frontend (Vite)
```bash
cd fe
npm install
npm run dev
```

### FastAPI (Python)
```bash
cd fastApi-python
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

## 7) Cấu hình môi trường (.env)

### Backend `be/.env`
Dựa trên `be/.env.example` và code:

| Biến | Mô tả | Ví dụ |
|---|---|---|
| `MONGO_URI` | Kết nối MongoDB | `mongodb://localhost:27017/mydb` |
| `JWT_SECRET` | Secret ký JWT | `your_super_secret_here` |
| `JWT_EXPIRES_IN` | TTL token | `3600s` |
| `PORT` | Port BE | `3000` |
| `OPENAI_API_KEY` | API key OpenAI | `sk-...` |
| `OPENAI_EMBEDDING_MODEL` | Model embedding | `text-embedding-3-small` |
| `OPENAI_CHAT_MODEL` | Model chat (code dùng) | `gpt-4o-mini` |
| `OPENAI_COMPLETION_MODEL` | Có trong `.env.example` (chưa thấy dùng trực tiếp) | `gpt-4o-mini` |
| `OPENAI_MODEL` | Có trong `.env.example` (chưa thấy dùng trực tiếp) | `gpt-4o-mini` |
| `CORS_ORIGINS` | Có trong `.env.example` (main.ts.bak có dùng) | `http://localhost:3001,https://your-frontend-domain.com` |
| `FASTAPI_BASE_URL` | URL FastAPI parse CV | `http://localhost:8000` |
| `FASTAPI_TIMEOUT_MS` | Timeout gọi FastAPI (ms) | `120000` |
| `LOCAL_CV_DIR` | Thư mục lưu file CV (tùy chọn) | `./uploads/cvs` |

### Frontend `fe/.env` / `fe/.env.local`
- `GEMINI_API_KEY`: đang có trong `fe/.env.local` (được inject ở `vite.config.ts`).
- `VITE_API_BASE_URL`: được đọc trong `fe/src/config/env.ts` (nhưng FE hiện đang dùng base URL cố định trong `fe/lib/api.ts`).

### FastAPI `fastApi-python`
- `GEMINI_API_KEY`: đọc từ `fastApi-python/config.py` hoặc biến môi trường (trong `parser.py`).
- `MOCK_GEMINI=1`: mock Gemini để test không cần API key.

## 8) Scripts từ package.json

### Backend `be/package.json`
- `build`: `nest build`
- `format`: `prettier --write "src/**/*.ts" "test/**/*.ts"`
- `start`: `nest start`
- `start:dev`: `nest start --watch`
- `start:debug`: `nest start --debug --watch`
- `start:prod`: `node dist/main`
- `lint`: `eslint "{src,apps,libs,test}/**/*.ts" --fix`
- `test`: `jest`
- `test:watch`: `jest --watch`
- `test:cov`: `jest --coverage`
- `test:debug`: `node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand`
- `test:e2e`: `jest --config ./test/jest-e2e.json`

### Frontend `fe/package.json`
- `dev`: `vite`
- `build`: `vite build`
- `preview`: `vite preview`

## 9) Cấu trúc thư mục
```text
.
├── be/                      # Backend NestJS
│   ├── src/
│   │   ├── auth/             # JWT auth
│   │   ├── modules/
│   │   │   ├── cv/            # CV module
│   │   │   ├── job/           # Job module
│   │   │   └── rag/           # RAG + matching
│   │   └── users/             # User module
│   ├── uploads/              # File CV upload
│   └── test/                 # Tests
├── fe/                      # Frontend React + Vite
│   ├── src/
│   │   ├── api/              # fetch wrapper
│   │   ├── components/       # UI components
│   │   ├── contexts/         # Auth/Modal context
│   │   ├── hooks/            # hooks
│   │   ├── pages/            # pages
│   │   └── utils/            # utils
│   └── lib/api.ts            # axios instance (baseURL cố định)
├── fastApi-python/           # FastAPI parse CV
│   ├── app.py                # FastAPI entry
│   ├── parser.py             # parse CV + Gemini
│   ├── requirements.txt
│   └── data/                 # uploads/results
└── README.md
```

## 10) API backend (nếu có)
**Base URL**: `http://localhost:3000` (theo `be/.env.example`).

### Auth
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/profile` (Bearer token)

### Jobs
- `GET /jobs`
- `GET /jobs/:id`
- `GET /jobs/user/me` (Bearer token)
- `POST /jobs` (Bearer token)
- `PUT /jobs/:id` (Bearer token)
- `PATCH /jobs/:id/rename` (Bearer token)
- `DELETE /jobs/:id` (Bearer token)

### CV
- `GET /cv`
- `GET /cv/search?q=...`
- `GET /cv/:id`
- `GET /cv/user/me` (Bearer token)
- `POST /cv` (Bearer token)
- `PUT /cv/:id`
- `PATCH /cv/:id/rename`
- `DELETE /cv/:id`
- `POST /cv/upload` (Bearer token, form-data file)
- `GET /cv/file/:filename`
- `GET /cv/local/:filename`
- `DELETE /cv/local/:filename`

### RAG / Matching
- `POST /rag/index-cv/:id`
- `POST /rag/index-all-cv`
- `POST /rag/index-job/:id`
- `POST /rag/index-all-job`
- `POST /rag/ask`
- `GET /rag/retrieve?q=...`
- `GET /rag/match-all-cvs-for-job-doc/:jobId`
- `GET /rag/match-all-jobs-for-cv-doc/:cvId`
- `GET /rag/match-job-cv-chunks/:jobId/:cvId`

### Ví dụ curl
**Login**
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secret"}'
```
**Response (rút gọn)**
```json
{
  "accessToken": "<jwt>",
  "user": { "_id": "...", "email": "user@example.com" }
}
```

**Upload CV**
```bash
curl -X POST http://localhost:3000/cv/upload \
  -H "Authorization: Bearer <jwt>" \
  -F "file=@/path/to/cv.pdf"
```
**Response (rút gọn)**
```json
{
  "message": "Uploaded and created CV successfully",
  "cv": { "_id": "..." },
  "filename": "...",
  "path": "uploads/cvs/..."
}
```

## 11) Troubleshooting
- **Port xung đột**: FE và BE đều mặc định `3000` (Vite config vs `.env.example`). Cần đổi 1 trong 2 port.
- **CORS**: `be/src/main.ts` đang bật CORS debug (cho phép mọi origin). Nếu gặp lỗi CORS, kiểm tra lại cấu hình FE/BE và biến `CORS_ORIGINS` (hiện chỉ thấy trong `main.ts.bak`).
- **FASTAPI không phản hồi**: kiểm tra `FASTAPI_BASE_URL` và `FASTAPI_TIMEOUT_MS`, đảm bảo FastAPI chạy port `8000`.
- **OpenAI lỗi**: kiểm tra `OPENAI_API_KEY` và model trong `.env`.
- **MongoDB lỗi kết nối**: kiểm tra `MONGO_URI`.

## 12) Đóng góp / License
- **Đóng góp**: chưa có `CONTRIBUTING.md` trong repo.
- **License**: chưa có file `LICENSE`; `be/package.json` đang để `UNLICENSED`.

## Thông tin cần bổ sung
- Version Node.js chuẩn dùng cho dự án.
- Cách cấu hình `VITE_API_BASE_URL` (FE hiện đang dùng base URL cố định trong `fe/lib/api.ts`).
- Biến `OPENAI_CHAT_MODEL`/`OPENAI_COMPLETION_MODEL`/`OPENAI_MODEL` dùng chuẩn nào (hiện code dùng `OPENAI_CHAT_MODEL`).
- Hướng dẫn chính thức cho `GEMINI_API_KEY` (FastAPI có dùng, FE chỉ inject nhưng chưa thấy sử dụng).
