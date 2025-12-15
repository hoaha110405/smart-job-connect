# # app.py
# import os
# import uuid
# import json
# import asyncio
# import traceback
# from fastapi import FastAPI, File, UploadFile, HTTPException
# from fastapi.responses import JSONResponse
# from concurrent.futures import ProcessPoolExecutor

# # import parse_resume từ file bạn đã tạo (resume_to_cv.py)
# from parser import parse_resume

# # --- config paths ---
# UPLOAD_DIR = "data/uploads"
# RESULT_DIR = "data/results"
# os.makedirs(UPLOAD_DIR, exist_ok=True)
# os.makedirs(RESULT_DIR, exist_ok=True)

# app = FastAPI(title="JobConnect Resume Parser (no-docker)")

# # Shared executor for CPU / blocking tasks
# executor = ProcessPoolExecutor(max_workers=os.cpu_count() or 2)

# def _status_path(cv_id: str) -> str:
#     return os.path.join(RESULT_DIR, f"{cv_id}.json")

# def write_status(cv_id: str, payload: dict):
#     path = _status_path(cv_id)
#     with open(path, "w", encoding="utf-8") as f:
#         json.dump(payload, f, ensure_ascii=False, indent=2)

# async def run_parse_in_executor(file_path: str, cv_id: str):
#     # update status -> processing
#     write_status(cv_id, {"cv_id": cv_id, "status": "processing", "file_path": file_path})
#     loop = asyncio.get_running_loop()
#     try:
#         # parse_resume is the function from resume_to_cv.py
#         result = await loop.run_in_executor(executor, parse_resume, file_path)

#         payload = {
#             "cv_id": cv_id,
#             "status": "done",
#             "file_path": file_path,
#             "result": result,
#         }
#         write_status(cv_id, payload)
#     except Exception as e:
#         tb = traceback.format_exc()
#         payload = {
#             "cv_id": cv_id,
#             "status": "error",
#             "error": str(e),
#             "traceback": tb
#         }
#         write_status(cv_id, payload)

# @app.post("/upload")
# async def upload(file: UploadFile = File(...)):
#     if not file:
#         raise HTTPException(status_code=400, detail="No file uploaded")
#     contents = await file.read()
#     # optional safety limit
#     if len(contents) > 100 * 1024 * 1024:  # 100MB
#         raise HTTPException(status_code=400, detail="File too large")

#     # ensure allowed extensions
#     _, ext = os.path.splitext(file.filename or "")
#     ext = ext.lower()
#     allowed = {".pdf", ".png", ".jpg", ".jpeg"}
#     if ext not in allowed:
#         raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

#     cv_id = str(uuid.uuid4())
#     filename = f"{cv_id}_{file.filename}"
#     save_path = os.path.join(UPLOAD_DIR, filename)
#     with open(save_path, "wb") as f:
#         f.write(contents)

#     # initial status file (pending)
#     write_status(cv_id, {"cv_id": cv_id, "status": "pending", "file_path": save_path})

#     # schedule background parse (non-blocking)
#     asyncio.create_task(run_parse_in_executor(save_path, cv_id))

#     return {"cv_id": cv_id}

# @app.get("/status/{cv_id}")
# def status(cv_id: str):
#     path = _status_path(cv_id)
#     if not os.path.exists(path):
#         return JSONResponse({"cv_id": cv_id, "status": "not_found"}, status_code=404)
#     with open(path, "r", encoding="utf-8") as f:
#         data = json.load(f)
#     return data

# @app.get("/result/{cv_id}")
# def get_result(cv_id: str):
#     path = _status_path(cv_id)
#     if not os.path.exists(path):
#         raise HTTPException(status_code=404, detail="Result not found")
#     with open(path, "r", encoding="utf-8") as f:
#         data = json.load(f)
#     if data.get("status") != "done":
#         return JSONResponse({"cv_id": cv_id, "status": data.get("status", "unknown")})
#     return data


# app.py (sửa: tạo executor trong startup, dùng spawn context, shutdown đúng lúc)
import os
import uuid
import json
import asyncio
import traceback
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from concurrent.futures import ProcessPoolExecutor
import multiprocessing

from parser import parse_resume

UPLOAD_DIR = "data/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(title="JobConnect Resume Parser (no-file-status)")

# --- Không tạo executor ở module import time! ---
# executor = ProcessPoolExecutor(...)  <-- tránh tạo ở đây

def save_upload(contents: bytes, filename: str) -> str:
    path = os.path.join(UPLOAD_DIR, filename)
    with open(path, "wb") as f:
        f.write(contents)
    return path

@app.on_event("startup")
async def startup_event():
    # tạo mp context 'spawn' để tránh rò rỉ liên quan tới fork (Linux).
    # Số worker bạn điều chỉnh theo cpu_count() hoặc config.
    mp_ctx = multiprocessing.get_context("spawn")
    max_workers = os.cpu_count() or 2
    # Lưu executor vào app.state để chia sẻ trong app
    app.state.executor = ProcessPoolExecutor(max_workers=max_workers, mp_context=mp_ctx)
    app.state._executor_owner = True  # marker (nếu cần kiểm tra)

@app.on_event("shutdown")
async def shutdown_event():
    # dọn executor, chặn tới khi các task kết thúc (hoặc wait=False nếu muốn terminate nhanh)
    exe = getattr(app.state, "executor", None)
    if exe is not None:
        try:
            # wait=True để shutdown sạch sẽ; nếu bạn muốn nhanh: wait=False
            exe.shutdown(wait=True)
        except Exception:
            pass
        finally:
            app.state.executor = None

@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")
    contents = await file.read()

    if len(contents) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large")

    _, ext = os.path.splitext(file.filename or "")
    ext = ext.lower()
    allowed = {".pdf", ".png", ".jpg", ".jpeg"}
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    cv_id = str(uuid.uuid4())
    filename = f"{cv_id}_{file.filename}"
    save_path = save_upload(contents, filename)

    # lấy executor từ app.state
    executor = getattr(app.state, "executor", None)
    if executor is None:
        # fallback: tạo tạm executor (không khuyến nghị lâu dài)
        mp_ctx = multiprocessing.get_context("spawn")
        executor = ProcessPoolExecutor(max_workers=1, mp_context=mp_ctx)

    loop = asyncio.get_running_loop()
    try:
        parsed = await loop.run_in_executor(executor, parse_resume, save_path)
        # xóa file tạm
        try:
            os.remove(save_path)
        except Exception:
            pass

        return JSONResponse({
            "cv_id": cv_id,
            "status": "done",
            "result": parsed
        })
    except Exception as e:
        tb = traceback.format_exc()
        try:
            os.remove(save_path)
        except Exception:
            pass
        return JSONResponse({
            "cv_id": cv_id,
            "status": "error",
            "error": str(e),
            "traceback": tb
        }, status_code=500)
