# NoclaimRx

Internal chat app for exploring data with an LLM. **Next.js 16** (App Router), **React 19**, **TypeScript**, **Tailwind CSS**, **shadcn/ui**, and **Clerk** for authentication. Conversations live in the browser (**localStorage** only—no chat database).

The **library** is a set of **static files** under `public/library/` (mostly CSV). Users check which files to include; the **server** loads those files from disk and attaches them to the model prompt—no upload UI.

---

## Features

- **Sign-in** with Clerk; everything except `/sign-in` is protected.
- **Chat** at `/chat` with **multiple sessions** (sidebar). The active session id is in the URL: `/chat?c=<sessionId>`. `/` redirects to `/chat`.
- **Model picker** (OpenAI, Anthropic, Google Gemini)—allowlisted ids in `lib/llm-models.ts`. Choice is stored in **localStorage**.
- **Library panel** on the chat page: pick files, preview, rough **token / row / column / size** metadata, **export** current session as JSON.
- **Token estimate** in the header (library files use offline provider counts; message turns use a rough estimate) via `POST /api/chat/token-estimate`.
- **System prompt** is **checked library files only** (wrapped plaintext + doc preamble in `lib/llm-chat-providers.ts`). No per-model base prompt files.

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

**Oversized library files:** each row shows token count and fit for the **currently selected model**. Files that exceed that model’s context window are disabled (server + UI). Switch models to see different limits—e.g. a file may fit GPT-5.5 but not Gemini Flash.

**Force-truncated files (SCRUM-1197):** tables whose full data is far larger than any context window are **refetched from S3 and force-truncated to a ~500k-token budget** so they stay selectable instead of being permanently blocked. The budget is sized against the **real Anthropic (Claude Opus) tokenizer** — chars/4 runs ~2.4× low on this CSV text — via a binary search, so the kept window actually fits. Tables with a date column keep the **contiguous date window centered on the median date** that fits the budget; date-less tables (e.g. `dim_patient`, `hcp_specialty_zip`, `hcp_list`) keep header + leading rows. `hcp_list` is re-derived from parquet **sorted ascending by `npi`** (empty NPIs excluded), so its row-cap keeps the lowest NPIs and the panel shows the kept **NPI range** (for comparison against the main platform). Re-run just that file with `python3 scripts/force_truncate_library.py hcp_list.csv`. The library panel shows the kept time frame (date tables), NPI range (`hcp_list`), or a "leading rows" note, plus the original row count / size. The result fits every model **except gpt-5.4-mini** (272k window). Every file row in the library panel shows its **date range**, and force-truncated rows additionally show **“Force-truncated to fit ~500k tokens”**, the kept **time frame**, and the **original** row count / size. See `scripts/force_truncate_library.py`.

---

## Static library (`public/library/`)

| File | Role |
|------|------|
| **`manifest.json`** | Array of `{ id, name, path }`. `path` is relative to `public/library/`. |
| **`*.csv`** (etc.) | Committed data files referenced by the manifest. |
| **`library-token-meta.json`** | Generated: per-file **estimated tokens** (chars÷4 on the same wrapped plaintext shape as the API), **row/column counts**, **file size**. The chat library UI reads this. |
| **`library-token-meta.json`** also carries, per file, a detected **`dateRange`** (date column + min/max) shown for every file, and a **`truncation`** block (strategy, kept time frame, original full stats) merged in for force-truncated files. |
| **`library-truncation.json`** | Generated by `scripts/force_truncate_library.py`: per force-truncated path, the **strategy** (`date-window` / `row-cap`), **date column**, kept **time frame**, **budget**, kept rows, and **original full-file** stats. The build generator merges this into `library-token-meta.json` for the UI. |
| **`library-full-file-stats.json`** | Legacy frozen-stats overrides for the older **header + 100-row** guardrail (see below). Empty when all large files are handled by force-truncation instead. |

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
4. For each CSV, detects a **date column** and records its min/max as **`dateRange`** in `fileStats` (shown for every file in the UI).
5. Merges any **`library-truncation.json`** entry into the matching `fileStats` as a **`truncation`** block (strategy, kept time frame, original full stats).
6. **Large CSV guardrail (legacy fallback):** if estimated tokens for a `.csv` are **> 1,000,000** and the path has **no** force-truncation entry, it **rewrites that CSV on disk** to **header + 100 data rows** and records the **pre-truncation** stats in **`library-full-file-stats.json`**. Prefer **force-truncation** (below) for large tables.

If you **shrink** a file enough that it no longer needs frozen stats, **remove its key** from `library-full-file-stats.json` before re-running the script so stats recompute from the actual file.

### Force-truncating an oversized table to a token budget (SCRUM-1197)

For tables far larger than any context window, **`scripts/force_truncate_library.py`** refetches the full source and cuts it to a **~500k-token** budget so it stays selectable (instead of being blocked). It **binary-searches against the real Anthropic Claude-Opus tokenizer** (needs `ANTHROPIC_API_KEY` in `.env`) rather than the chars/4 estimate, which runs ~2.4× low on this data. It keeps the **middle date window** for date-bearing tables, or **leading rows** for date-less ones, and writes the kept **time frame** + original stats to **`library-truncation.json`**. Run `pnpm precalculate-library-tokens` afterward to fill in exact per-model counts (Gemini typically lands highest but still within its window).

```bash
# 1. Refetch full sources from S3 (parquet, gitignored)
for s in paidsearch_activity paidsocial_activity email_activity \
         digitalmedia_activity claims_processing_activity claims_status \
         dim_patient hcp_prescribing_activity sales_rep_call_activity hcp_specialty_zip; do
  aws s3 cp "s3://<bucket>/$s/$s.parquet" "public/library/$s.parquet" --profile <profile> --only-show-errors
done

# 2. Derive full CSVs (column drops / row filters / date formatting)
python3 scripts/clean_library_parquet_derived.py
python3 scripts/clean_digitalmedia_activity.py

# 3. Derive the 3 uncovered tables + force-truncate all to ~500k tokens
python3 scripts/force_truncate_library.py

# 4. Refresh token meta (dateRange + merged truncation block)
node scripts/generate-library-token-meta.cjs
```

Commit the truncated CSVs, **`library-truncation.json`**, and **`library-token-meta.json`**. The parquet sources stay gitignored.

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
6. Optionally run **`pnpm precalculate-library-tokens`** (requires API keys in `.env`) to refresh per-model provider token counts in **`library-token-meta.json`**.

**`email_activity.csv`** in this repo is an example of a curated export: built from parquet with `relative_*` columns removed, lifecycle date columns trimmed to **`_date`**, rows requiring non-empty **`hcp_npi`** and **`campaign_name`**, sentinel **`opened_date`** epoch values cleared, and constant columns dropped—then run through the generator above.

---

## System prompt

The model **`system`** string (Anthropic `system`, OpenAI `system` message, Gemini `systemInstruction`) contains **only wrapped library file text** (`lib/llm-chat-providers.ts`). When nothing is checked, no system string is sent.

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
| `lib/library-file-token-policy.ts` | Per-model library file token lookup + context-window blocking |
| `scripts/generate-library-token-meta.cjs` | Metadata + dateRange + merged truncation block (legacy CSV guardrail) |
| `scripts/force_truncate_library.py` | Refetch + force-truncate oversized tables to ~500k tokens (SCRUM-1197) |
| `scripts/parquet_to_csv.py` | Parquet → UTF-8 CSV helper |
| `proxy.ts` | Clerk auth at the network boundary |
