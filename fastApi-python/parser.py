# resume_to_cv.py
import os
import json
import re
from datetime import datetime

# optional imports for PDF/ocr/llm; import errors will be raised later when used
try:
    import fitz  # pymupdf
except Exception:
    fitz = None

try:
    import pytesseract
except Exception:
    pytesseract = None

try:
    from PIL import Image
except Exception:
    Image = None

# gemini client will be imported/configured lazily
_gemini_client = None
_gemini_configured = False

# load GEMINI_API_KEY safely (config.py or env)
GEMINI_API_KEY = ""
try:
    import config

    GEMINI_API_KEY = getattr(config, "GEMINI_API_KEY", "") or ""
except Exception:
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# allow mocking Gemini for tests: export MOCK_GEMINI=1
MOCK_GEMINI = os.environ.get("MOCK_GEMINI", "") == "1"


def ensure_gemini_configured():
    """
    Lazy import and configure the google.generativeai client.
    Returns the gemini module if configured, else None.
    """
    global _gemini_client, _gemini_configured, GEMINI_API_KEY
    if _gemini_configured and _gemini_client is not None:
        return _gemini_client
    if MOCK_GEMINI:
        _gemini_configured = True
        _gemini_client = None
        return None
    if not GEMINI_API_KEY:
        # not configured
        return None
    try:
        import google.generativeai as gemini
    except Exception:
        return None
    gemini.configure(api_key=GEMINI_API_KEY)
    _gemini_client = gemini
    _gemini_configured = True
    return _gemini_client


# ---------- STEP 1: Extract text ----------
def extract_text_from_pdf(path: str) -> str:
    if fitz is None:
        raise RuntimeError("pymupdf (fitz) not installed. pip install pymupdf")
    doc = fitz.open(path)
    text = ""
    for page in doc:
        text += page.get_text("text") + "\n"
    return text


def extract_text_from_img(path: str) -> str:
    if Image is None or pytesseract is None:
        raise RuntimeError("Pillow and pytesseract required for image OCR. pip install pillow pytesseract")
    img = Image.open(path)
    return pytesseract.image_to_string(img)


# ---------- STEP 2: LLM prompt (STRICT mapping to Cv schema) ----------
CV_STRICT_PROMPT_TEMPLATE = '''
You are a STRICT resume-to-CV-schema extractor. Your task: extract ONLY information explicitly present in the resume text and output a single valid JSON object that matches the Cv schema exactly (no extra keys, no missing keys). Do NOT infer, guess, or add information not present in the text.

Requirements (must follow exactly):
1. Output must be strictly valid JSON with EXACTLY the keys shown below and no additional keys.
2. Use these types and defaults:
   - string fields: "" when missing
   - boolean fields: false when missing
   - numeric fields (integers/floats): 0 when missing
   - arrays: [] when missing
   - date fields: ISO 8601 format (YYYY-MM-DD or YYYY-MM or YYYY) if present, otherwise "".
3. createdBy: omit from output (this system does not use createdBy).
4. For any field not explicitly present in resume, return the default ("" / [] / 0 / false) — do NOT attempt to infer.
5. Do NOT include explanatory text, markdown, or code fences — output only the JSON object.

Cv schema (output EXACTLY this structure; keep order if possible):

{
  "avatarUrl": "",
  "fullname": "",
  "preferredName": "",
  "email": "",
  "phone": "",
  "location": {"city": "", "state": "", "country": ""},
  "headline": "",
  "summary": "",
  "targetRole": "",
  "employmentType": [],
  "salaryExpectation": "",
  "availability": "",
  "skills": [
    {"name": "", "level": "", "category": "", "years": 0}
  ],
  "experiences": [
    {
      "id": "",
      "title": "",
      "company": "",
      "companyWebsite": "",
      "location": "",
      "from": "",
      "to": "",
      "isCurrent": false,
      "employmentType": "",
      "teamSize": 0,
      "responsibilities": [],
      "achievements": [],
      "tags": []
    }
  ],
  "education": [
    {"degree": "", "major": "", "school": "", "from": "", "to": "", "gpa": ""}
  ],
  "projects": [
    {"name": "", "description": "", "role": "", "from": "", "to": "", "techStack": [], "url": "", "metrics": []}
  ],
  "certifications": [
    {"name": "", "issuer": "", "issueDate": "", "expiryDate": "", "credentialUrl": ""}
  ],
  "languages": [
    {"name": "", "level": ""}
  ],
  "portfolio": [
    {"mediaType": "", "url": "", "description": ""}
  ],
  "references": [
    {"name": "", "relation": "", "contact": "", "note": ""}
  ],
  "status": "",
  "tags": [],
  "version": 0
}

Extraction rules and clarifications:
- Dates: return as ISO (YYYY-MM-DD or YYYY-MM or YYYY). If the resume says "Present" or "Now", set the `to` field to "Present".
- Booleans: set true/false only if explicitly stated. Otherwise false.
- Numeric fields: `years`, `teamSize`, `version` must be numbers (0 when missing).
- `skills`: each entry should contain the skill name in `name`. If a proficiency level explicitly appears (e.g., "Advanced", "C1"), put into `level`. `years` only when explicitly present as a number in the resume.
- `experiences.responsibilities` and `achievements`: fill from bullet points; keep them as short strings, do not add extra commentary.
- `companyWebsite`, `email`, `phone`, `avatarUrl`, `credentialUrl`, `url` — include only if explicitly present.
- `tags`: include only tags explicitly listed in resume (as array of strings).
- Remove duplicates within arrays.
- Language: extract only what's written (do not translate). If language level present, keep it (e.g., "English - C1").

Now parse the following resume text. Remember: ONLY extract values that appear explicitly in this text. Do not infer anything.

Resume text:
{resume_text}
'''


def extract_with_gemini(text: str) -> dict:
    """
    Call Gemini (or mock) and return parsed JSON (as dict).
    Uses .replace(...) for injecting resume_text to avoid .format KeyError.
    """
    # Mock path (for dev without API key)
    if MOCK_GEMINI:
        # return minimal valid schema for testing
        return {
          "avatarUrl": "", "fullname": "Mock User", "preferredName": "",
          "email": "", "phone": "", "location": {"city": "", "state": "", "country": ""}, "headline": "",
          "summary": "Mocked resume", "targetRole": "", "employmentType": [], "salaryExpectation": "",
          "availability": "", "skills": [], "experiences": [], "education": [], "projects": [],
          "certifications": [], "languages": [], "portfolio": [], "references": [],
          "status": "draft", "tags": [], "version": 0
        }

    # ensure gemini configured
    gemini_client = ensure_gemini_configured()
    if gemini_client is None:
        raise RuntimeError(
            "Google Gemini client not configured. Set GEMINI_API_KEY in config.py or environment variable "
            "and install google-generativeai package."
        )

    # inject resume text safely
    prompt = CV_STRICT_PROMPT_TEMPLATE.replace("{resume_text}", text)

    # Use the same client API style you preferred
    model = gemini_client.GenerativeModel("gemini-2.5-flash")
    response = model.generate_content(prompt)

    raw_output = ""
    try:
        raw_output = response.candidates[0].content.parts[0].text
    except Exception:
        raw_output = response.text if hasattr(response, "text") else ""

    raw_output = raw_output.strip()
    if raw_output.startswith("```"):
        raw_output = raw_output.strip("`")
        raw_output = raw_output.replace("json", "", 1).strip()

    try:
        return json.loads(raw_output)
    except Exception as e:
        print("JSON parse error:", e)
        print("Raw output (first 1000 chars):")
        print(raw_output[:1000])
        return {}


# ---------- Helpers: cleaning, date parsing, dedupe ----------
def parse_to_iso(d: str) -> str:
    if not d:
        return ""
    ds = str(d).strip()
    if not ds:
        return ""
    low = ds.lower()
    if low in ["present", "now", "current", "hiện tại"]:
        return "Present"
    # Try common formats
    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y"):
        try:
            dt = datetime.strptime(ds, fmt)
            if fmt == "%Y":
                return dt.strftime("%Y")
            elif fmt == "%Y-%m":
                return dt.strftime("%Y-%m")
            else:
                return dt.strftime("%Y-%m-%d")
        except Exception:
            continue
    # last attempt: try to extract YYYY or YYYY-MM
    m = re.search(r"(\d{4})(-(\d{2}))?", ds)
    if m:
        if m.group(3):
            return f"{m.group(1)}-{m.group(3)}"
        return m.group(1)
    return ""


def unique_list(seq):
    seen = set()
    out = []
    for s in seq:
        key = str(s).strip()
        if key and key not in seen:
            seen.add(key)
            out.append(key)
    return out


# ---------- STEP 3: Validate / Normalize LLM output ----------
DEFAULT_SCHEMA = {
    "avatarUrl": "",
    "fullname": "",
    "preferredName": "",
    "email": "",
    "phone": "",
    "location": {"city": "", "state": "", "country": ""},
    "headline": "",
    "summary": "",
    "targetRole": "",
    "employmentType": [],
    "salaryExpectation": "",
    "availability": "",
    "skills": [{"name": "", "level": "", "category": "", "years": 0}],
    "experiences": [
        {
            "id": "",
            "title": "",
            "company": "",
            "companyWebsite": "",
            "location": "",
            "from": "",
            "to": "",
            "isCurrent": False,
            "employmentType": "",
            "teamSize": 0,
            "responsibilities": [],
            "achievements": [],
            "tags": []
        }
    ],
    "education": [{"degree": "", "major": "", "school": "", "from": "", "to": "", "gpa": ""}],
    "projects": [{"name": "", "description": "", "role": "", "from": "", "to": "", "techStack": [], "url": "", "metrics": []}],
    "certifications": [{"name": "", "issuer": "", "issueDate": "", "expiryDate": "", "credentialUrl": ""}],
    "languages": [{"name": "", "level": ""}],
    "portfolio": [{"mediaType": "", "url": "", "description": ""}],
    "references": [{"name": "", "relation": "", "contact": "", "note": ""}],
    "status": "",
    "tags": [],
    "version": 0
}


def validate_and_normalize(data: dict) -> dict:
    if not isinstance(data, dict):
        return DEFAULT_SCHEMA.copy()

    clean = {}

    # top-level simple fields
    for k in [
        "avatarUrl", "fullname", "preferredName", "email", "phone",
        "headline", "summary", "targetRole", "salaryExpectation", "availability", "status"
    ]:
        clean[k] = str(data.get(k, "") or "")

    # location
    loc = data.get("location", {}) or {}
    clean["location"] = {
        "city": str(loc.get("city", "") or ""),
        "state": str(loc.get("state", "") or ""),
        "country": str(loc.get("country", "") or "")
    }

    # employmentType - array of strings
    et = data.get("employmentType", []) or []
    if isinstance(et, str):
        et = [s.strip() for s in et.split(",") if s.strip()]
    clean["employmentType"] = unique_list(et)

    # tags
    tags = data.get("tags", []) or []
    if isinstance(tags, str):
        tags = [s.strip() for s in tags.split(",") if s.strip()]
    clean["tags"] = unique_list(tags)

    # skills
    skills_in = data.get("skills", []) or []
    skills_out = []
    if isinstance(skills_in, dict):
        skills_in = [skills_in]
    for s in skills_in:
        if not isinstance(s, dict):
            continue
        name = str(s.get("name", "") or "")
        level = str(s.get("level", "") or "")
        category = str(s.get("category", "") or "")
        years = s.get("years", 0) or 0
        try:
            years = int(float(years))
        except Exception:
            years = 0
        if name:
            skills_out.append({"name": name, "level": level, "category": category, "years": years})
    clean["skills"] = skills_out if skills_out else []

    # experiences
    ex_in = data.get("experiences", []) or []
    ex_out = []
    if isinstance(ex_in, dict):
        ex_in = [ex_in]
    for e in ex_in:
        if not isinstance(e, dict):
            continue
        title = str(e.get("title", "") or "")
        company = str(e.get("company", "") or "")
        companyWebsite = str(e.get("companyWebsite", "") or "")
        location = str(e.get("location", "") or "")
        from_date = parse_to_iso(str(e.get("from", "") or ""))
        to_date = parse_to_iso(str(e.get("to", "") or ""))
        isCurrent = bool(e.get("isCurrent", False))
        employmentType = str(e.get("employmentType", "") or "")
        try:
            teamSize = int(float(e.get("teamSize", 0) or 0))
        except Exception:
            teamSize = 0
        responsibilities = e.get("responsibilities", []) or []
        achievements = e.get("achievements", []) or []
        tags_e = e.get("tags", []) or []
        if isinstance(responsibilities, str):
            responsibilities = [r.strip() for r in responsibilities.split("\n") if r.strip()]
        if isinstance(achievements, str):
            achievements = [r.strip() for r in achievements.split("\n") if r.strip()]
        ex_out.append({
            "id": str(e.get("id", "") or ""),
            "title": title,
            "company": company,
            "companyWebsite": companyWebsite,
            "location": location,
            "from": from_date,
            "to": to_date,
            "isCurrent": isCurrent,
            "employmentType": employmentType,
            "teamSize": teamSize,
            "responsibilities": unique_list(responsibilities),
            "achievements": unique_list(achievements),
            "tags": unique_list(tags_e)
        })
    clean["experiences"] = ex_out if ex_out else []

    # education
    edu_in = data.get("education", []) or []
    edu_out = []
    if isinstance(edu_in, dict):
        edu_in = [edu_in]
    for ed in edu_in:
        if not isinstance(ed, dict):
            continue
        degree = str(ed.get("degree", "") or "")
        major = str(ed.get("major", "") or "")
        school = str(ed.get("school", "") or "")
        from_date = parse_to_iso(str(ed.get("from", "") or ""))
        to_date = parse_to_iso(str(ed.get("to", "") or ""))
        gpa = str(ed.get("gpa", "") or "")
        edu_out.append({"degree": degree, "major": major, "school": school, "from": from_date, "to": to_date, "gpa": gpa})
    clean["education"] = edu_out if edu_out else []

    # projects
    proj_in = data.get("projects", []) or []
    proj_out = []
    if isinstance(proj_in, dict):
        proj_in = [proj_in]
    for p in proj_in:
        if not isinstance(p, dict):
            continue
        name = str(p.get("name", "") or "")
        desc = str(p.get("description", "") or "")
        role = str(p.get("role", "") or "")
        from_date = parse_to_iso(str(p.get("from", "") or ""))
        to_date = parse_to_iso(str(p.get("to", "") or ""))
        techStack = p.get("techStack", []) or []
        if isinstance(techStack, str):
            techStack = [s.strip() for s in techStack.split(",") if s.strip()]
        url = str(p.get("url", "") or "")
        metrics = p.get("metrics", []) or []
        proj_out.append({"name": name, "description": desc, "role": role, "from": from_date, "to": to_date, "techStack": unique_list(techStack), "url": url, "metrics": unique_list(metrics)})
    clean["projects"] = proj_out if proj_out else []

    # certifications
    cert_in = data.get("certifications", []) or []
    cert_out = []
    if isinstance(cert_in, dict):
        cert_in = [cert_in]
    for c in cert_in:
        if not isinstance(c, dict):
            continue
        name = str(c.get("name", "") or "")
        issuer = str(c.get("issuer", "") or "")
        issueDate = parse_to_iso(str(c.get("issueDate", "") or c.get("year", "") or ""))
        expiryDate = parse_to_iso(str(c.get("expiryDate", "") or ""))
        credentialUrl = str(c.get("credentialUrl", "") or "")
        cert_out.append({"name": name, "issuer": issuer, "issueDate": issueDate, "expiryDate": expiryDate, "credentialUrl": credentialUrl})
    clean["certifications"] = cert_out if cert_out else []

    # languages
    lang_in = data.get("languages", []) or []
    lang_out = []
    if isinstance(lang_in, dict):
        lang_in = [lang_in]
    for l in lang_in:
        if not isinstance(l, dict):
            parts = [p.strip() for p in re.split(r'[-–—]|,', str(l)) if p.strip()]
            name = parts[0] if parts else str(l)
            level = parts[1] if len(parts) > 1 else ""
        else:
            name = str(l.get("name", "") or "")
            level = str(l.get("level", "") or "")
        if name:
            lang_out.append({"name": name, "level": level})
    clean["languages"] = lang_out if lang_out else []

    # portfolio
    port_in = data.get("portfolio", []) or []
    port_out = []
    if isinstance(port_in, dict):
        port_in = [port_in]
    for p in port_in:
        if not isinstance(p, dict):
            continue
        mediaType = str(p.get("mediaType", "") or "")
        url = str(p.get("url", "") or "")
        desc = str(p.get("description", "") or "")
        port_out.append({"mediaType": mediaType, "url": url, "description": desc})
    clean["portfolio"] = port_out if port_out else []

    # references
    ref_in = data.get("references", []) or []
    ref_out = []
    if isinstance(ref_in, dict):
        ref_in = [ref_in]
    for r in ref_in:
        if not isinstance(r, dict):
            continue
        name = str(r.get("name", "") or "")
        relation = str(r.get("relation", "") or "")
        contact = str(r.get("contact", "") or "")
        note = str(r.get("note", "") or "")
        ref_out.append({"name": name, "relation": relation, "contact": contact, "note": note})
    clean["references"] = ref_out if ref_out else []

    # final numeric/version defaults
    try:
        version = int(float(data.get("version", 0) or 0))
    except Exception:
        version = 0
    clean["version"] = version

    # ensure status present
    clean["status"] = str(data.get("status", "") or clean.get("status", ""))

    # Ensure all keys in DEFAULT_SCHEMA are present in clean
    final = {}
    for k, v in DEFAULT_SCHEMA.items():
        final[k] = clean.get(k, v)

    return final


# ---------- Wrapper: parse_resume returns document ready to insert into DB ----------
def parse_resume(file_path: str) -> dict:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        raw_text = extract_text_from_pdf(file_path)
    elif ext in [".png", ".jpg", ".jpeg"]:
        raw_text = extract_text_from_img(file_path)
    else:
        raise ValueError(f"Unsupported file format: {ext}")

    llm_data = extract_with_gemini(raw_text)
    normalized = validate_and_normalize(llm_data)
    return normalized


# ---------- Run example ----------
if __name__ == "__main__":
    file_path = "public/resume.pdf"

    if not os.path.exists(file_path):
        print("❌ File not found:", file_path)
    else:
        try:
            result = parse_resume(file_path)
            print(json.dumps(result, indent=2, ensure_ascii=False))
        except ValueError as e:
            print("❌", e)
