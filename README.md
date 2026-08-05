# 🍽️ Zomato Menu Manager

AI-powered menu management tool for Zomato restaurants — built with Next.js + FastAPI + Python workers.

---

## ⚡ Quick Start (after cloning)

### 1. Prerequisites — install these first

| Tool | Why | Install |
|------|-----|---------|
| **Node.js 18+** | Frontend (Next.js) | https://nodejs.org |
| **Python 3.12** | Backend (FastAPI) | https://python.org |
| **uv** | Python package manager | `pip install uv` or https://docs.astral.sh/uv |

---

### 2. Clone & enter the repo

```bash
git clone https://github.com/ajitkushwaha123/zomato-menu-manager.git
cd zomato-menu-manager
```

---

### 3. Create `.env` files

The `.env` files are **not committed** to git (they contain secrets). Create them manually:

#### `frontend/.env`
```env
NEXT_PUBLIC_BASE_URL=http://localhost:2000
ZOMATO_API_BASE_URL=https://www.zomato.com
ZOMATO_API_BASE_URL_V2=https://api.zomato.com
MONGODB_URI=<your MongoDB connection string>
AWS_ACCESS_KEY_ID=<your AWS key>
AWS_SECRET_ACCESS_KEY=<your AWS secret>
AWS_S3_BUCKET=menu-ai
AWS_REGION=ap-southeast-2
REDIS_URL=<your Redis URL>
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<your Google OAuth client ID>
GOOGLE_CLIENT_SECRET=<your Google OAuth secret>
AWS_BEDROCK_API_KEY=<your Bedrock key>
```

#### `backend/.env`
```env
APP_NAME=Menu AI
AWS_ACCESS_KEY_ID=<your AWS key>
AWS_SECRET_ACCESS_KEY=<your AWS secret>
AWS_S3_BUCKET=menu-ai
AWS_REGION=ap-southeast-2
ZOMATO_API_BASE_URL=https://www.zomato.com
ZOMATO_API_BASE_URL_V2=https://api.zomato.com
MONGODB_URI=<your MongoDB connection string>
REDIS_URL=<your Redis URL>
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<your Google OAuth client ID>
GOOGLE_CLIENT_SECRET=<your Google OAuth secret>
AWS_BEDROCK_API_KEY=<your Bedrock key>
AWS_SQS_MENU_UPLOAD_QUEUE=<your SQS queue URL>
OPENAI_API_KEY=<your OpenAI key>
OPENAI_MODEL=gpt-4.1
GEMINI_API_KEY=<your Gemini key>
GEMINI_MODEL=gemini-2.0-flash-exp
BEDROCK_MODEL=amazon.nova-lite-v1:0
```

> Ask the team for the actual values — never commit secrets to git.

---

### 4. Install dependencies

```bash
# Root (concurrently for dev orchestration)
npm install

# Frontend (Next.js)
cd frontend && npm install && cd ..

# Backend (Python — uv handles the venv automatically)
cd backend && uv sync && cd ..
```

---

### 5. Run the app

```bash
# Mac / Linux / Windows (all the same command)
npm run dev
```

This starts **3 services in parallel**:

| Service | URL | Label |
|---------|-----|-------|
| Next.js frontend | http://localhost:2000 | `[NEXT]` |
| FastAPI backend | http://localhost:2001 | `[API]` |
| Python background worker | — | `[WORKER]` |

Press `Ctrl+C` to stop everything.

---

## 🗂️ Project Structure

```
zomato-menu-manager/
├── frontend/          # Next.js 14 App Router
│   ├── src/
│   │   ├── app/       # Pages + API routes
│   │   ├── components/
│   │   ├── store/     # Redux store
│   │   └── services/
│   └── package.json
├── backend/           # FastAPI + Python
│   ├── app/
│   │   ├── api/       # FastAPI routes
│   │   ├── ai/        # LangChain / LLM logic
│   │   ├── services/  # SQS, queue services
│   │   └── workers/   # Background menu worker
│   └── pyproject.toml
├── package.json       # Root scripts (concurrently)
└── dev.sh             # Mac/Linux alternative launcher
```

---

## 🪟 Windows Notes

- Use `npm run dev` (works in CMD, PowerShell, or Git Bash)
- Do **not** run `dev.sh` directly — it's for Mac/Linux only
- Make sure `uv` is in your PATH after installing

## 🍎 Mac/Linux Notes

- `npm run dev` works the same way
- Alternatively: `./dev.sh` (uses bash, kills lingering ports automatically)

---

## 🔧 Individual Service Commands

```bash
npm run dev:frontend    # Next.js only
npm run dev:backend     # FastAPI only
npm run dev:bg-worker   # Python worker only
```
