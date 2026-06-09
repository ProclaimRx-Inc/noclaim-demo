#!/usr/bin/env python3
"""Force-truncate oversized library tables to a token budget (SCRUM-1197).

Background
----------
A handful of library CSVs are far larger than any model context window. They used
to be cut to "header + 100 rows" on disk and shown as a hard "over context limit"
error (blocked, unselectable). Instead we now **force-truncate them to a time
frame** so they fit a ~500k-token budget and surface the resulting date window in the
library UI. The budget is sized against the **real Anthropic (Claude Opus) tokenizer**
via a binary search — chars/4 runs ~2.4x low on this CSV text — so the kept window
actually fits (every model except gpt-5.4-mini's 272k window). Requires ANTHROPIC_API_KEY.

This script refetches nothing itself — it expects the full source parquet to be
present under public/library/<stem>.parquet (gitignored). Pull them first, e.g.:

    for s in paidsearch_activity paidsocial_activity email_activity \\
             digitalmedia_activity claims_processing_activity claims_status \\
             dim_patient hcp_prescribing_activity sales_rep_call_activity \\
             hcp_specialty_zip; do
      aws s3 cp "s3://<bucket>/$s/$s.parquet" "public/library/$s.parquet" \\
        --profile <profile> --only-show-errors
    done

Pipeline (run from repo root, with pyarrow installed):

    python3 scripts/clean_library_parquet_derived.py   # full CSVs for 6 tables
    python3 scripts/clean_digitalmedia_activity.py      # full CSV for digitalmedia
    python3 scripts/force_truncate_library.py           # derive 3 + truncate all 10
    node scripts/generate-library-token-meta.cjs        # refresh token meta + dateRange

What this script does
---------------------
1. Derives FULL CSVs for the three tables without a dedicated cleaner
   (paidsearch, paidsocial, email) straight from parquet, matching the committed
   column shape and YYYY-MM-DD date formatting.
2. For every target table, reads the FULL CSV on disk and force-truncates it:
   - date-window tables: keeps the contiguous date window **centered on the median
     date**, expanding outward until the next date group would blow the budget;
   - date-less tables (dim_patient, hcp_specialty_zip): keeps header + as many
     leading rows as fit the budget.
   The truncated CSV overwrites the on-disk file (this is what ships).
3. Writes public/library/library-truncation.json (per-path: strategy, date column,
   full-file stats, kept rows, budget) for the generator + UI to read.
4. Prunes the now-fitting paths out of public/library/library-full-file-stats.json
   so the generator computes real (small) stats and the files stop being blocked.

Requires: pip install pyarrow
"""

from __future__ import annotations

import csv
import io
import json
import math
import os
import urllib.request
from pathlib import Path

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

REPO = Path(__file__).resolve().parents[1]
LIB = REPO / "public" / "library"
MANIFEST_PATH = LIB / "manifest.json"
TRUNCATION_PATH = LIB / "library-truncation.json"
FULL_STATS_PATH = LIB / "library-full-file-stats.json"

# Real-token budget per file. We size to the REAL provider tokenizer, not chars/4
# (which runs ~2.4x low on this CSV text). The window is chosen so the anchor model's
# real count lands just under this budget.
TOKEN_BUDGET = 500_000

# Anchor tokenizer for the binary search: Claude Opus is the highest *working* counter
# here (the demo's Gemini id 400s on the count API), so sizing to it keeps every model
# at or below the budget. The full per-model counts are filled in afterwards by
# scripts/precalculate-library-provider-tokens.mjs.
ANCHOR_MODEL = "claude-opus-4-7"
# Never send a count request larger than this estimate (keeps request bodies sane); the
# real ~500k crossover sits near a ~210k chars/4 estimate, well under this cap.
ESTIMATE_CAP = 360_000

# Primary date column per table; None means "no usable date column" -> row cap.
DATE_COLUMN: dict[str, str | None] = {
    "paidsearch_activity.csv": "date",
    "paidsocial_activity.csv": "date",
    "email_activity.csv": "created_date",
    "digitalmedia_activity.csv": "date",
    "claims_processing_activity.csv": "datetime_status",
    "claims_status.csv": "datetime_start",
    "dim_patient.csv": None,
    "hcp_prescribing_activity.csv": None,  # set below from header presence
    "sales_rep_call_activity.csv": "call_date",
    "hcp_specialty_zip.csv": None,
}
DATE_COLUMN["hcp_prescribing_activity.csv"] = "date_submitted"


def build_plaintext(name: str, rel_path: str, content: str) -> str:
    """Match buildPlaintext() in generate-library-token-meta.cjs exactly."""
    return (
        f"=== FILE: {name} ===\n"
        f"Path: {rel_path}\n\n"
        f"--- CONTENT ---\n"
        f"{content}\n"
        f"--- END CONTENT ---"
    )


def estimate_tokens(text: str) -> int:
    if not text or not text.strip():
        return 0
    return max(1, math.ceil(len(text) / 4))


def content_tokens(name: str, rel_path: str, content: str) -> int:
    """Chars/4 estimate of the wrapped plaintext (cheap; used to bound the search)."""
    return estimate_tokens(build_plaintext(name, rel_path, content))


def load_env() -> None:
    env_path = REPO / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k.strip(), v)


def anthropic_count_tokens(system: str) -> int:
    """Real input-token count for the wrapped library text via the Anthropic API,
    matching the chat app's shape (library text in `system`, placeholder user turn)."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set (needed for real-token sizing)")
    body = json.dumps(
        {"model": ANCHOR_MODEL, "system": system, "messages": [{"role": "user", "content": "."}]}
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages/count_tokens",
        data=body,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)["input_tokens"]


# --------------------------------------------------------------------------------------
# Derivation of the three tables without a dedicated cleaner.
# --------------------------------------------------------------------------------------

def _strftime_ymd(col: pa.ChunkedArray) -> pa.ChunkedArray:
    if pa.types.is_timestamp(col.type):
        return pc.strftime(col, format="%Y-%m-%d")
    return col


def _write_csv(columns: list[str], rows: list[list[str]], path: Path) -> None:
    buf = io.StringIO(newline="")
    w = csv.writer(buf, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
    w.writerow(columns)
    for r in rows:
        w.writerow(r)
    path.write_text(buf.getvalue(), encoding="utf-8")


def _table_to_rows(t: pa.Table, columns: list[str]) -> list[list[str]]:
    cols = {c: t.column(c) for c in columns}
    rows: list[list[str]] = []
    for i in range(t.num_rows):
        row: list[str] = []
        for c in columns:
            v = cols[c][i].as_py()
            s = "" if v is None else str(v)
            s = s.replace("\r\n", "\n").replace("\r", "\n")
            row.append(s)
        rows.append(row)
    return rows


def derive_paid_table(stem: str) -> None:
    """paidsearch / paidsocial: drop relative_date, date -> YYYY-MM-DD, keep order."""
    t = pq.read_table(LIB / f"{stem}.parquet")
    if "date" in t.column_names:
        t = t.set_column(t.column_names.index("date"), "date", _strftime_ymd(t.column("date")))
    out_cols = [c for c in t.column_names if c != "relative_date"]
    _write_csv(out_cols, _table_to_rows(t, out_cols), LIB / f"{stem}.csv")
    print(f"Derived {stem}.csv ({t.num_rows:,} rows, {len(out_cols)} columns)")


def derive_email() -> None:
    """email_activity: project committed columns, require npi+campaign, clear opened sentinel."""
    t = pq.read_table(LIB / "email_activity.parquet")
    src_to_out = {
        "email_subject": "email_subject",
        "hcp_npi": "hcp_npi",
        "campaign_id": "campaign_id",
        "campaign_name": "campaign_name",
        "template_id": "template_id",
        "template_name": "template_name",
        "created_date_time": "created_date",
        "delivered_date_time": "delivered_date",
        "opened_date_time": "opened_date",
    }
    out_cols = list(src_to_out.values())
    npi = pc.fill_null(t.column("hcp_npi"), "")
    camp = pc.fill_null(t.column("campaign_name"), "")
    keep = pc.and_(
        pc.greater(pc.utf8_length(pc.utf8_trim_whitespace(npi)), 0),
        pc.greater(pc.utf8_length(pc.utf8_trim_whitespace(camp)), 0),
    )
    t = t.filter(keep)
    formatted: dict[str, pa.ChunkedArray] = {}
    for src, out in src_to_out.items():
        formatted[out] = _strftime_ymd(t.column(src))
    rows: list[list[str]] = []
    for i in range(t.num_rows):
        row: list[str] = []
        for out in out_cols:
            v = formatted[out][i].as_py()
            s = "" if v is None else str(v)
            # Clear the epoch sentinel used for "never opened".
            if out == "opened_date" and s.startswith(("1970-01-01", "1969-12-31")):
                s = ""
            s = s.replace("\r\n", "\n").replace("\r", "\n")
            row.append(s)
        rows.append(row)
    _write_csv(out_cols, rows, LIB / "email_activity.csv")
    print(f"Derived email_activity.csv ({t.num_rows:,} rows, {len(out_cols)} columns)")


# --------------------------------------------------------------------------------------
# Truncation.
# --------------------------------------------------------------------------------------

def _read_full_csv(path: Path) -> tuple[str, list[str]]:
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")
    if lines and lines[-1] == "":
        lines.pop()  # trailing newline
    return text, lines


def _content_from_lines(header: str, data_lines: list[str]) -> str:
    return header + "\n" + "\n".join(data_lines) + "\n"


def real_tokens(name: str, rel_path: str, content: str) -> int:
    return anthropic_count_tokens(build_plaintext(name, rel_path, content))


def _search_largest(name, rel_path, header, lines_for, kmax):
    """Largest k in [0, kmax] whose real token count stays within the budget.

    `lines_for(k)` returns the data lines for size k and must grow monotonically with k.
    Cheap chars/4 estimate first caps how large a request we ever send to the count API,
    then a binary search on real tokens finds the budget crossover.
    Returns (best_k, kept_lines, real_tokens_for_best).
    """
    def est_k(k):
        return content_tokens(name, rel_path, _content_from_lines(header, lines_for(k)))

    hi = kmax
    if est_k(hi) > ESTIMATE_CAP:
        a, b = 0, kmax
        while a < b:
            m = (a + b + 1) // 2
            if est_k(m) <= ESTIMATE_CAP:
                a = m
            else:
                b = m - 1
        hi = a

    a, b = 0, hi
    best_k, best_tok = 0, 0
    while a <= b:
        m = (a + b) // 2
        tok = real_tokens(name, rel_path, _content_from_lines(header, lines_for(m)))
        if tok <= TOKEN_BUDGET:
            best_k, best_tok = m, tok
            a = m + 1
        else:
            b = m - 1
    return best_k, lines_for(best_k), best_tok


def _truncate_row_cap(name, rel_path, header, data):
    _, kept, tok = _search_largest(name, rel_path, header, lambda n: data[:n], len(data))
    return kept, tok


def _truncate_date_window(name, rel_path, header, data, date_col):
    """Keep the contiguous date window centered on the median date that fits the budget."""
    header_cols = next(csv.reader([header]))
    if date_col not in header_cols:
        kept, tok = _truncate_row_cap(name, rel_path, header, data)
        return kept, None, None, tok
    idx = header_cols.index(date_col)

    # (date_str, original_line) for rows with a usable YYYY-MM-DD date.
    dated: list[tuple[str, str]] = []
    for line in data:
        try:
            fields = next(csv.reader([line]))
        except StopIteration:
            continue
        if idx >= len(fields):
            continue
        d = fields[idx].strip()
        if len(d) >= 10 and d[4] == "-" and d[7] == "-":
            dated.append((d[:10], line))
    if not dated:
        kept, tok = _truncate_row_cap(name, rel_path, header, data)
        return kept, None, None, tok

    ordered_dates = sorted({d for d, _ in dated})
    k = len(ordered_dates)
    mid = k // 2

    def bounds(r):
        return max(0, mid - r), min(k - 1, mid + r)

    def window_lines(r):
        lo, hi = bounds(r)
        window = set(ordered_dates[lo : hi + 1])
        return [line for d, line in dated if d in window]

    r_max = max(mid, k - 1 - mid)
    best_r, kept, tok = _search_largest(name, rel_path, header, window_lines, r_max)

    # Even the median day overflows: fall back to a row cap within that day.
    if not kept:
        by_date = [line for d, line in dated if d == ordered_dates[mid]]
        kept, tok = _truncate_row_cap(name, rel_path, header, by_date)
        return kept, ordered_dates[mid], ordered_dates[mid], tok

    lo, hi = bounds(best_r)
    return kept, ordered_dates[lo], ordered_dates[hi], tok


def main() -> int:
    load_env()
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    name_by_path = {e["path"]: e["name"] for e in manifest if isinstance(e, dict)}

    # 1. Derive the three tables that have no dedicated cleaner.
    if (LIB / "paidsearch_activity.parquet").is_file():
        derive_paid_table("paidsearch_activity")
    if (LIB / "paidsocial_activity.parquet").is_file():
        derive_paid_table("paidsocial_activity")
    if (LIB / "email_activity.parquet").is_file():
        derive_email()

    # 2. Truncate every target table.
    truncation: dict[str, object] = {}
    for rel_path, date_col in DATE_COLUMN.items():
        abs_path = LIB / rel_path
        if not abs_path.is_file():
            print(f"  skip (no full CSV on disk): {rel_path}")
            continue
        name = name_by_path.get(rel_path, rel_path)

        full_text, lines = _read_full_csv(abs_path)
        header, data = lines[0], lines[1:]
        full_rows = len(data)
        full_size = len(full_text.encode("utf-8"))
        full_tokens = content_tokens(name, rel_path, full_text)

        if date_col:
            kept, start, end, anchor_tokens = _truncate_date_window(
                name, rel_path, header, data, date_col
            )
            strategy = "date-window" if start else "row-cap"
        else:
            kept, anchor_tokens = _truncate_row_cap(name, rel_path, header, data)
            strategy, start, end = "row-cap", None, None

        new_content = _content_from_lines(header, kept)
        abs_path.write_text(new_content, encoding="utf-8")
        kept_estimate = content_tokens(name, rel_path, new_content)

        truncation[rel_path] = {
            "strategy": strategy,
            "dateColumn": date_col if strategy == "date-window" else None,
            "timeFrame": ({"start": start, "end": end} if strategy == "date-window" else None),
            "budgetTokens": TOKEN_BUDGET,
            "anchorModel": ANCHOR_MODEL,
            "keptRows": len(kept),
            "keptAnchorTokens": anchor_tokens,
            "keptEstimatedTokens": kept_estimate,
            "full": {"rows": full_rows, "sizeBytes": full_size, "estimatedTokens": full_tokens},
        }
        frame = f"{start} -> {end}" if start else f"first {len(kept):,} rows"
        print(
            f"Truncated {rel_path}: {full_rows:,} -> {len(kept):,} rows "
            f"({anchor_tokens:,} real / ~{kept_estimate:,} est tok, {strategy}, {frame})"
        )

    TRUNCATION_PATH.write_text(json.dumps(truncation, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {TRUNCATION_PATH.relative_to(REPO)}")

    # 3. These paths now fit; drop them from the frozen-stats overrides so the
    #    generator computes real stats and they are no longer blocked.
    if FULL_STATS_PATH.is_file():
        overrides = json.loads(FULL_STATS_PATH.read_text(encoding="utf-8"))
        removed = [p for p in truncation if p in overrides]
        for p in removed:
            del overrides[p]
        FULL_STATS_PATH.write_text(json.dumps(overrides, indent=2) + "\n", encoding="utf-8")
        if removed:
            print(f"Removed {len(removed)} now-fitting path(s) from {FULL_STATS_PATH.name}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
