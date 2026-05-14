# Noclaim

Internal **Noclaim** chat app: Next.js (App Router), TypeScript, Tailwind, shadcn/ui, and Clerk for simple auth.

## Purpose

- Lightweight internal tool; keep the architecture simple.
- Chat UI is similar to a minimal ChatGPT-style layout with **multiple conversations** stored only in **localStorage** (no chat database).
- Library documents are **static files in this repo** under `public/library/` (no in-app upload pipeline).

## Core behavior

- User signs in with Clerk; all routes except sign-in are protected.
- User can maintain **multiple chat sessions** (sidebar: **New chat** + list). Active session is reflected in the URL as `/chat?c=<sessionId>`.
- User sends messages; the app calls **`POST /api/chat`** (server-side OpenAI). Responses are **plain text** (no streaming, no markdown renderer, no tools/agents).
- Optional **library** files selected on the Library page are read in the browser and their plaintext (same shape as the preview dialog) is sent with each request for model context.
- **Export** downloads the **current session** as JSON (`id`, `title`, `updatedAt`, `messages`) for debugging or extraction.

## Library files (repo-managed)

1. Add UTF-8 text files under `public/library/` (you can use subfolders).
2. Edit `public/library/manifest.json` — an array of entries:

```json
[
  {
    "id": "unique-stable-id",
    "name": "Human title",
    "path": "relative/path/from/library/root.txt"
  }
]
```

3. Deploy (e.g. push to Vercel). In the app, open **Library** and use **Refresh list** if you already had the page open.
4. Use the checkboxes to choose which files are **included in the next chat** requests. **Preview** shows the exact document block used for the model (the API also prepends a short system instruction before those blocks).

### Parquet → text (for dimensions / extracts)

Raw `.parquet` files under `public/library/` are **gitignored** (they can be large). Convert to UTF-8 TSV text and commit the `.txt` plus a `manifest.json` entry:

```bash
python3 -m venv .venv-parquet && . .venv-parquet/bin/activate && pip install pyarrow
python scripts/parquet_to_tsv.py public/library/your_file.parquet public/library/your_file.txt
```

### Library size (demo tradeoffs)

Shipping **very large** `.txt` files in `public/` works for an internal demo, but a few caveats:

- **Browser + model context**: the app loads selected files in the client and sends their full text with each chat request. Huge files mean slow loads, big payloads, and easy **context overflow** (cost + truncation).
- **Git + deploy size**: large blobs bloat the repo and every Vercel build unless you use **Git LFS** or host files elsewhere.

**Low-hanging fruit** if this grows:

1. **Pre-summarize or slice** data before `.txt` (e.g. top N rows, or one file per topic).
2. **Smarter selection**: only attach files the user explicitly checks (already the case); add a visible **character / token estimate** in the Library preview later.
3. **Move blobs to object storage** (Vercel Blob, S3) with signed URLs and server-side fetch + trim — more moving parts, but better than multi‑MB `public/` for production-shaped demos.
4. **Server-side retrieval** in `/api/chat`: accept file ids, load and cap text on the server (single round trip, easier to enforce limits).

For now, keeping **small–medium** derived `.txt` files in `public/library/` is the simplest path.

## Environment variables

| Variable | Where | Purpose |
|----------|--------|---------|
| `OPENAI_API_KEY` | **Vercel**: Project → **Settings** → **Environment Variables** | Required for `/api/chat`. Create a secret key in the [OpenAI API keys](https://platform.openai.com/api-keys) page and paste it. Add for **Production** and **Preview** (and **Development** if you use `vercel env pull`). Redeploy after adding or changing. |
| `OPENAI_MODEL` | Same (optional) | Defaults to **`gpt-5.4-mini`**. Override if you want a different model id. |

Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, etc.) stay as you already configured for this project.

### Adding `OPENAI_API_KEY` on Vercel

1. Open your project on [vercel.com](https://vercel.com).
2. **Settings** → **Environment Variables**.
3. **Add** → Name `OPENAI_API_KEY`, value your secret, environments: at least **Production** and **Preview**.
4. Save, then **Deployments** → **⋯** on the latest deployment → **Redeploy** (or push a new commit).

## Local development

```bash
npm install
# Set Clerk + OpenAI in .env.local (see env table above)
npm run dev
```

## Product checklist (historical / v0 notes)

Resolved in this repo where applicable:

1. Light/dark toggle works (`ThemeToggle`).
2. No attach-from-chat control; library is managed on the **Library** page.
3. Sign out uses Clerk `signOut` with redirect to `/sign-in`.
4. Vercel Speed Insights (and Analytics in production) are wired in `app/layout.tsx`.
5. Chat **Export** exports the current session JSON.
6. Library: no upload UI — documents come from the repo + manifest.
7. No bundled test document; use real entries in `manifest.json` when ready.
