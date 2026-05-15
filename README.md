# NoclaimRx

Internal chat app for exploring data with an LLM. **Next.js 16** (App Router), **React 19**, **TypeScript**, **Tailwind CSS**, **shadcn/ui**, and **Clerk** for authentication. Conversations live in the browser (**localStorage** only—no chat database).

The **library** is a set of **static files** under `public/library/` (mostly CSV). Users check which files to include; the **server** loads those files from disk and attaches them to the model prompt—no upload UI.

---

## Features

- **Sign-in** with Clerk; everything except `/sign-in` is protected.
- **Chat** at `/chat` with **multiple sessions** (sidebar). The active session id is in the URL: `/chat?c=<sessionId>`. `/` redirects to `/chat`.
- **Model picker** (OpenAI, Anthropic, Google Gemini)—allowlisted ids in `lib/llm-models.ts`. Choice is stored in **localStorage**.
- **Library panel** on the chat page: pick files, preview, rough **token / row / column / size** metadata, **export** current session as JSON.
- **Token estimate** in the header (rough prompt size for the next send) via `POST /api/chat/token-estimate`.
- **System prompt** per model under `content/system-prompts/<model-id>.txt` (see `lib/model-system-prompt-server.ts`).

---

## Tech stack

| Area | Notes |
|------|--------|
| Framework | Next.js **16.2**, App Router |
| UI | Tailwind v4, Radix/shadcn components |
| Auth | `@clerk/nextjs` |
| LLMs | `openai`, `@anthropic-ai/sdk`, `@google/generative-ai` (routed in `lib/llm-chat-providers.ts`) |
| Package manager | **pnpm** (`packageManager` in `package.json`); `npm` works for one-off scripts if you prefer |

---

## Local development

```bash
pnpm install
# Add Clerk + provider keys to .env.local (see below)
pnpm dev
```

- **Build:** `pnpm build` runs **`prebuild`**, which executes `node scripts/generate-library-token-meta.cjs` so library metadata stays in sync with `public/library/` (see [Library file updates & build metadata](#library-file-updates--build-metadata)).

---

## Auth: `proxy.ts` (not `middleware.ts`)

Next.js 16 deprecates the root **`middleware.ts`** name in favor of **`proxy.ts`**. This repo uses **`proxy.ts`** at the project root with **`export const proxy = clerkMiddleware(...)`** so Clerk runs at the edge-compatible entrypoint. Public routes: `/sign-in`, `/sign-up` (see `proxy.ts`).

---

## Chat API and library behavior

- **`POST /api/chat`** — body includes `messages`, `model`, and **`selectedLibraryIds`** (manifest entry ids). The server resolves files from `public/library/` and builds the same document blocks the UI would show; it does **not** trust client-sent file blobs for library content.
- **`POST /api/chat/token-estimate`** — same `selectedLibraryIds` to estimate prompt size for the next turn.
- **`POST /api/chat/system-preview`** — optional debug view of the composed system string for the current model + selection.

**Oversized library files:** if a file’s estimated token count (see metadata below) is **above ~1M**, it is **blocked** from send (server + UI). Those rows are highlighted in the library panel with a warning state.

---

## Static library (`public/library/`)

| File | Role |
|------|------|
| **`manifest.json`** | Array of `{ id, name, path }`. `path` is relative to `public/library/`. |
| **`*.csv`** (etc.) | Committed data files referenced by the manifest. |
| **`library-token-meta.json`** | Generated: per-file **estimated tokens** (chars÷4 on the same wrapped plaintext shape as the API), **row/column counts**, **file size**. The chat library UI reads this. |
| **`library-full-file-stats.json`** | Generated when a CSV is **truncated** on disk because it exceeded the token threshold: stores **full-file** stats so the UI still shows the original row count / size / token estimate while the committed CSV may only contain a **100-row sample**. |

Large **`.parquet`** sources can live next to CSVs for local rebuilds but are **gitignored** (`public/library/*.parquet` in `.gitignore`).

---

## Library file updates & build metadata

Whenever you **add, remove, or materially change** a library file or a **`manifest.json`** entry, refresh the generated JSON so token estimates, row counts, and truncation stay correct.

### What runs automatically

`package.json` **`prebuild`** runs:

```bash
node scripts/generate-library-token-meta.cjs
```

So a normal **`pnpm build`** updates metadata before production bundles.

### What the script does

1. Reads **`manifest.json`** and each listed file under `public/library/`.
2. For each file, computes the same **wrapped plaintext** shape the chat API uses and estimates tokens as **`ceil(chars / 4)`** (rough lower bound, not vendor tokenizer output).
3. Writes **`library-token-meta.json`** (`byManifestId`, `byFilePath`, `fileStats` keyed by `path`).
4. **Large CSV guardrail:** if estimated tokens for a `.csv` are **> 1,000,000**, it **rewrites that CSV on disk** to **header + 100 data rows** and records the **pre-truncation** stats for that path in **`library-full-file-stats.json`**. On later runs, paths listed there keep **display** stats from that file even though the on-disk CSV is small.

If you **shrink** a file enough that it no longer needs frozen stats, **remove its key** from `library-full-file-stats.json` before re-running the script so stats recompute from the actual file.

### Typical workflow for a new dataset

1. (Optional) Keep a **`.parquet`** in `public/library/` for local-only regeneration (ignored by git).
2. Convert or export to **UTF-8 CSV** — helper: `scripts/parquet_to_csv.py` (requires `pyarrow`):

   ```bash
   python3 -m venv .venv-parquet && . .venv-parquet/bin/activate && pip install pyarrow
   python3 scripts/parquet_to_csv.py public/library/source.parquet public/library/source.csv
   ```

3. Apply any **column/row filters** you want (spreadsheet, Python, etc.). For complex pipelines (joins, date normalization, dropping columns), use a **one-off script** or notebook; the repo does not enforce a single ETL format beyond “valid UTF-8 text the model can read”.
4. Add an entry to **`manifest.json`** (`id` stable for stored `localStorage` selections).
5. Run **`node scripts/generate-library-token-meta.cjs`** (or **`pnpm build`**) and commit **`library-token-meta.json`**, the CSV/text file, **`manifest.json`**, and **`library-full-file-stats.json`** if it changed.

**`email_activity.csv`** in this repo is an example of a curated export: built from parquet with `relative_*` columns removed, lifecycle date columns trimmed to **`_date`**, rows requiring non-empty **`hcp_npi`** and **`campaign_name`**, sentinel **`opened_date`** epoch values cleared, and constant columns dropped—then run through the generator above.

---

## System prompts

Per allowlisted model id, edit **`content/system-prompts/<model-id>.txt`**. That text is loaded as the base system string before the app’s markdown hint and any checked library files (`lib/model-system-prompt-server.ts`).

---

## Environment variables

| Variable | Purpose |
|----------|---------|
| **Clerk** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, … | As in your Clerk dashboard / Vercel project. |
| `OPENAI_API_KEY` | OpenAI models (`gpt-*`). |
| `ANTHROPIC_API_KEY` | Anthropic models (`claude-*`). |
| `GEMINI_API_KEY` (or `GOOGLE_GENERATIVE_AI_API_KEY` / `GOOGLE_API_KEY`) | Gemini models. |

Only configure providers you actually use. Redeploy after changing env vars on Vercel.

---

## Deploy (Vercel)

1. Connect the repo; ensure env vars above are set for **Production** (and **Preview** if needed).
2. Push to trigger a build; **`prebuild`** refreshes library metadata during `pnpm build`.
3. After changing **`public/library/`** assets, hard-refresh the chat page if the browser caches old `manifest.json` / `library-token-meta.json`.

---

## Useful paths

| Path | Description |
|------|-------------|
| `app/(protected)/chat/` | Chat UI and session handling |
| `app/api/chat/` | Chat, token estimate, system preview routes |
| `components/chat-library-panel.tsx` | Library list + metadata + preview |
| `lib/library-resolve-server.ts` | Manifest + file read + “blocked selection” checks |
| `lib/library-file-token-policy.ts` | ~1M token send threshold |
| `scripts/generate-library-token-meta.cjs` | Metadata + optional CSV truncation |
| `scripts/parquet_to_csv.py` | Parquet → UTF-8 CSV helper |
| `proxy.ts` | Clerk auth at the network boundary |
