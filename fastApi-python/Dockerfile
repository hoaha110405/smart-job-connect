FROM python:3.11-slim

WORKDIR /app

# system deps for pytesseract / poppler/opencv if needed (minimal)
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    libgl1 \
    build-essential \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
