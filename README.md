# Noclaim

Internal **Noclaim** chat app: Next.js (App Router), TypeScript, Tailwind, shadcn/ui, and Clerk for simple auth.

## Purpose

- Lightweight internal tool; keep the architecture simple.
- Chat UI is similar to a minimal ChatGPT-style layout with **multiple conversations** stored only in **localStorage** (no chat database).
- Library documents are **static files in this repo** under `public/library/` (no in-app upload pipeline).

## Core behavior

- User signs in with Clerk; all routes except sign-in are protected.
- User can maintain **multiple chat sessions** (sidebar: **New chat** + list). Active session is reflected in the URL as `/chat?c=<sessionId>`.
- User sends messages; the app calls **`POST /api/chat`** with a **user-selected model** (stored in `localStorage`). The server calls **OpenAI**, **Anthropic**, or **Google Gemini** depending on that model. Responses are **plain text** (no streaming in the UI).
- Optional **library** files selected in the **chat** right-hand panel are read in the browser and their raw text (same as the API document block) is sent with each request for model context.
- **Export** downloads the **current session** as JSON (`id`, `title`, `updatedAt`, `messages`) for debugging or extraction.

## Library files (repo-managed)

1. Add UTF-8 text files under `public/library/` (commonly `.csv`; any plain text is fine).
2. Edit `public/library/manifest.json` — an array of entries:

```json
[
  {
    "id": "unique-stable-id",
    "name": "Human title",
    "path": "relative/path/from/library/root.csv"
  }
]
```

3. Deploy (e.g. push to Vercel). The manifest is loaded when you open **Chat** (hard refresh the page after a deploy if the list looks stale).
4. On **Chat**, use the right panel to check files, **Select all** / **Unselect all**, and **Preview** (CSV files show as a markdown heading + table). The API still receives the raw file text in a document block. If the model rejects the request for **context length**, the chat shows a clear **context window limit** message.

### Parquet → text (for dimensions / extracts)

Raw `.parquet` files under `public/library/` are **gitignored** (they can be large). Convert to UTF-8 CSV and commit the `.csv` plus a `manifest.json` entry:

```bash
python3 -m venv .venv-parquet && . .venv-parquet/bin/activate && pip install pyarrow
python scripts/parquet_to_csv.py public/library/your_file.parquet public/library/your_file.csv
```

### Library size (demo tradeoffs)

Shipping **very large** library files in `public/` works for an internal demo, but a few caveats:

- **Browser + model context**: the app loads selected files in the client and sends their full text with each chat request. Huge files mean slow loads, big payloads, and easy **context overflow** (cost + truncation).
- **Git + deploy size**: large blobs bloat the repo and every Vercel build unless you use **Git LFS** or host files elsewhere.

**Low-hanging fruit** if this grows:

1. **Pre-summarize or slice** data before export (e.g. top N rows, or one file per topic).
2. **Smarter selection**: only attach files the user explicitly checks (already the case); add a visible **character / token estimate** in the preview later.
3. **Move blobs to object storage** (Vercel Blob, S3) with signed URLs and server-side fetch + trim — more moving parts, but better than multi‑MB `public/` for production-shaped demos.
4. **Server-side retrieval** in `/api/chat`: accept file ids, load and cap text on the server (single round trip, easier to enforce limits).

For now, keeping **small–medium** derived files (e.g. `.csv`) in `public/library/` is the simplest path.

## Environment variables

| Variable | Where | Purpose |
|----------|--------|---------|
| `OPENAI_API_KEY` | Vercel / `.env.local` | Required when users pick an **OpenAI** model (`gpt-*`). [OpenAI API keys](https://platform.openai.com/api-keys). |
| `ANTHROPIC_API_KEY` | Vercel / `.env.local` | Required when users pick an **Anthropic** model (`claude-*`). [Anthropic console](https://console.anthropic.com/). |
| `GEMINI_API_KEY` | Vercel / `.env.local` | Preferred for **Gemini** models. Alternatively set **`GOOGLE_GENERATIVE_AI_API_KEY`** or **`GOOGLE_API_KEY`** (same route accepts any of these). [Google AI Studio](https://aistudio.google.com/apikey). |

Add only the keys for the providers you use. Redeploy after changing env vars.

Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, etc.) stay as you already configured for this project.

### Adding API keys on Vercel

1. Open your project on [vercel.com](https://vercel.com).
2. **Settings** → **Environment Variables**.
3. Add `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and/or `GEMINI_API_KEY` (or `GOOGLE_GENERATIVE_AI_API_KEY`) depending on which model families you use.
4. Save, then **Deployments** → **⋯** on the latest deployment → **Redeploy** (or push a new commit).

## Local development

```bash
npm install
# Set Clerk + provider API keys in .env.local (see env table)
pnpm dev
```

## Product checklist (historical / v0 notes)

Resolved in this repo where applicable:

1. Light/dark toggle works (`ThemeToggle`).
2. No attach-from-chat control; the **library lives in the chat** right panel (`/files` redirects to `/chat`).
3. Sign out uses Clerk `signOut` with redirect to `/sign-in`.
4. Vercel Speed Insights (and Analytics in production) are wired in `app/layout.tsx`.
5. Chat **Export** exports the current session JSON.
6. Library: no upload UI — documents come from the repo + manifest.
7. No bundled test document; use real entries in `manifest.json` when ready.
