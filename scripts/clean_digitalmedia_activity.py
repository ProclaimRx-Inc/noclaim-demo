#!/usr/bin/env python3
"""Transform digitalmedia_activity from parquet → cleaned CSV (library path).

- Drops `relative_date`.
- `date`: ISO date only (YYYY-MM-DD), UTC calendar day from stored timestamps.
- `placement`: split on |, drop empty segments and tokens NA / None / N/A (see _placement_token_drop).
- Drops rows where `url_landing_page` or `url_click_through` is null/empty (after strip).

Requires: pip install pyarrow

Run from repo root:
  python3 scripts/clean_digitalmedia_activity.py

Then refresh library metadata (may truncate large CSVs for the repo):
  node scripts/generate-library-token-meta.cjs
"""

from __future__ import annotations

import csv
import io
import sys
from datetime import datetime, timezone
from pathlib import Path

import pyarrow.parquet as pq

REPO = Path(__file__).resolve().parents[1]
PARQUET = REPO / "public/library/digitalmedia_activity.parquet"
CSV_OUT = REPO / "public/library/digitalmedia_activity.csv"


def _placement_token_drop(t: str) -> bool:
    """True = omit this token from placement."""
    if not t:
        return True
    if t.lower() == "none":
        return True
    u = t.upper()
    if u in ("NA", "N/A"):
        return True
    return False


def clean_placement(val: object) -> str:
    if val is None:
        return ""
    parts = str(val).split("|")
    out: list[str] = []
    for p in parts:
        t = p.strip()
        if _placement_token_drop(t):
            continue
        out.append(t)
    return "|".join(out)


def fmt_date_utc(v: object) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):
        dt = v
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc)
        return dt.strftime("%Y-%m-%d")
    return str(v)[:10]


def url_empty(v: object) -> bool:
    if v is None:
        return True
    if isinstance(v, str) and v.strip() == "":
        return True
    return False


def main() -> int:
    if not PARQUET.is_file():
        print(f"Missing parquet: {PARQUET}", file=sys.stderr)
        return 1

    t = pq.read_table(PARQUET)
    names = list(t.column_names)
    n = t.num_rows

    try:
        i_ul = names.index("url_landing_page")
    except ValueError:
        print("Column url_landing_page missing", file=sys.stderr)
        return 1

    try:
        i_uc = names.index("url_click_through")
    except ValueError:
        print("Column url_click_through missing", file=sys.stderr)
        return 1

    empty_landing = 0
    empty_click = 0
    both_urls_ok = 0

    for r in range(n):
        ul = t.column(i_ul)[r].as_py()
        uc = t.column(i_uc)[r].as_py()
        bl = url_empty(ul)
        bc = url_empty(uc)
        if bl:
            empty_landing += 1
        if bc:
            empty_click += 1
        if not bl and not bc:
            both_urls_ok += 1

    removed = n - both_urls_ok
    print(
        f"Keeping rows with both URLs non-empty: {both_urls_ok:,} of {n:,} "
        f"({100 * both_urls_ok / n:.2f}%)"
    )
    print(f"Removed (missing landing and/or click): {removed:,} ({100 * removed / n:.2f}%)")
    print(f"  — url_landing_page null/empty: {empty_landing:,} of {n:,}")
    print(f"  — url_click_through null/empty: {empty_click:,} of {n:,}")

    out_cols = [c for c in names if c != "relative_date"]
    idx_map = [names.index(c) for c in out_cols]

    buf = io.StringIO(newline="")
    w = csv.writer(buf, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
    w.writerow(out_cols)

    i_date = out_cols.index("date") if "date" in out_cols else -1
    i_place = out_cols.index("placement") if "placement" in out_cols else -1

    written = 0
    for r in range(n):
        ul_raw = t.column(i_ul)[r].as_py()
        uc_raw = t.column(i_uc)[r].as_py()
        if url_empty(ul_raw) or url_empty(uc_raw):
            continue

        row_out: list[str] = []
        for j, ci in enumerate(idx_map):
            v = t.column(ci)[r].as_py()
            if j == i_date:
                s = fmt_date_utc(v)
            elif j == i_place:
                s = clean_placement(v)
            else:
                s = "" if v is None else str(v)
            s = s.replace("\r\n", "\n").replace("\r", "\n")
            row_out.append(s)
        w.writerow(row_out)
        written += 1

    CSV_OUT.write_text(buf.getvalue(), encoding="utf-8")
    print(
        f"Wrote {CSV_OUT} ({written:,} rows after landing+click filter, was {n:,}; {len(out_cols)} columns)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
