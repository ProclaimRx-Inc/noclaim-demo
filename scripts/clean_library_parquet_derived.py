#!/usr/bin/env python3
"""Apply column cleanup to selected library tables from parquet → CSV.

Includes row filters (null state, complete prescribing fields, non-null imsid,
non-empty npi/zip) and column drops (zip, ped_ic_exclusion, etc.).

Requires: pip install pyarrow

  python3 scripts/clean_library_parquet_derived.py
  node scripts/generate-library-token-meta.cjs
"""

from __future__ import annotations

import csv
import io
import sys
from pathlib import Path

import pyarrow as pa
import pyarrow.csv as pac
import pyarrow.compute as pc
import pyarrow.parquet as pq

REPO = Path(__file__).resolve().parents[1]
LIB = REPO / "public/library"


def read_library_table(stem: str) -> pa.Table:
    """Prefer parquet (full data); fall back to CSV if parquet is absent (e.g. preview-only checkout)."""
    pq_path = LIB / f"{stem}.parquet"
    if pq_path.is_file():
        return pq.read_table(pq_path)
    csv_path = LIB / f"{stem}.csv"
    if csv_path.is_file():
        return pac.read_csv(csv_path)
    raise FileNotFoundError(f"Missing both {pq_path.name} and {csv_path.name} under {LIB}")


def to_yyyy_mm_dd(col: pa.ChunkedArray) -> pa.ChunkedArray:
    """Date-only string for CSV export; no-op if already string (e.g. CSV round-trip)."""
    if pa.types.is_timestamp(col.type):
        return pc.strftime(col, format="%Y-%m-%d")
    return col


def imsid_row_usable(imsid: pa.ChunkedArray) -> pa.ChunkedArray:
    """False for SQL-style null, empty/whitespace, or the literal string NULL (any case)."""
    trimmed = pc.utf8_trim_whitespace(imsid.fill_null(""))
    upper = pc.utf8_upper(trimmed)
    bad = pc.or_(
        pc.is_null(imsid),
        pc.or_(pc.equal(pc.utf8_length(trimmed), 0), pc.equal(upper, "NULL")),
    )
    return pc.invert(bad)


def replace_literal_null_tokens_in_strings(t: pa.Table) -> pa.Table:
    """Turn the four-letter sentinel NULL in string cells into empty string (after imsid filter)."""
    data = dict(zip(t.column_names, t.columns))
    for name in t.column_names:
        col = t[name]
        ty = col.type
        if not (pa.types.is_string(ty) or pa.types.is_large_string(ty)):
            continue
        trimmed_u = pc.utf8_trim_whitespace(pc.utf8_upper(col.fill_null("")))
        lit = pc.equal(trimmed_u, "NULL")
        data[name] = pc.if_else(lit, pa.scalar("", type=ty), col)
    return pa.table(data)


def table_with_timestamps_as_strings(t: pa.Table) -> pa.Table:
    """Match scripts/parquet_to_csv.py — timestamps that remain use string cast for as_py()."""
    arrays = []
    for j in range(t.num_columns):
        col = t.column(j)
        if pa.types.is_timestamp(col.type):
            arrays.append(pc.cast(col, pa.string()))
        else:
            arrays.append(col)
    return pa.Table.from_arrays(arrays, names=t.column_names)


def with_replaced_columns(t: pa.Table, **replacements: object) -> pa.Table:
    data = {name: replacements.get(name, t[name]) for name in t.column_names}
    return pa.table(data)


def drop_columns(t: pa.Table, *names: str) -> pa.Table:
    drop = set(names) & set(t.column_names)
    return pa.table({c: t[c] for c in t.column_names if c not in drop})


def write_table_csv(t: pa.Table, path: Path) -> None:
    t2 = table_with_timestamps_as_strings(t)
    names = t2.column_names
    buf = io.StringIO(newline="")
    w = csv.writer(buf, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
    w.writerow(names)
    for i in range(t2.num_rows):
        row: list[str] = []
        for j in range(t2.num_columns):
            v = t2.column(j)[i].as_py()
            s = "" if v is None else str(v)
            s = s.replace("\r\n", "\n").replace("\r", "\n")
            row.append(s)
        w.writerow(row)
    path.write_text(buf.getvalue(), encoding="utf-8")


def _i64_sum(mask) -> int:
    return int(pc.sum(pc.cast(mask, pa.int64())).as_py() or 0)


def main() -> int:
    def log(msg: str) -> None:
        print(msg)

    # --- claims_processing_activity ---
    t = read_library_table("claims_processing_activity")
    ds = t.column("datetime_status")
    new_ds = to_yyyy_mm_dd(ds)
    t = with_replaced_columns(t, datetime_status=new_ds)
    write_table_csv(t, LIB / "claims_processing_activity.csv")
    log(f"Wrote claims_processing_activity.csv ({t.num_rows:,} rows); datetime_status → YYYY-MM-DD")

    # --- claims_status ---
    t = read_library_table("claims_status")
    repl = {}
    for col in ("datetime_start", "datetime_closed"):
        repl[col] = to_yyyy_mm_dd(t.column(col))
    t = with_replaced_columns(t, **repl)
    write_table_csv(t, LIB / "claims_status.csv")
    log(f"Wrote claims_status.csv ({t.num_rows:,} rows); datetime_start & datetime_closed → YYYY-MM-DD")

    # --- dim_patient: drop zip, drop rows with null state ---
    t = read_library_table("dim_patient")
    n0 = t.num_rows
    state_ok = pc.is_valid(t["state"])
    n_drop_state = n0 - _i64_sum(state_ok)
    t = t.filter(state_ok)
    t = drop_columns(t, "zip")
    log("")
    log("=== dim_patient.csv ===")
    log(f"Dropped column zip; removed {n_drop_state:,} rows with null state ({n0:,} → {t.num_rows:,})")
    write_table_csv(t, LIB / "dim_patient.csv")
    log(f"Wrote dim_patient.csv ({t.num_rows:,} rows, {len(t.column_names)} columns)")

    # --- hcp_prescribing_activity ---
    t = read_library_table("hcp_prescribing_activity")
    n0 = t.num_rows
    t = drop_columns(t, "relative_date_submitted")
    t = with_replaced_columns(
        t, date_submitted=to_yyyy_mm_dd(t.column("date_submitted"))
    )
    dc = t["distribution_channel"]
    py = t["payer"]
    ab = t["abandoned"]
    dc_ok = pc.and_(pc.is_valid(dc), pc.greater(pc.utf8_length(pc.utf8_trim_whitespace(dc)), 0))
    py_ok = pc.and_(pc.is_valid(py), pc.greater(pc.utf8_length(pc.utf8_trim_whitespace(py)), 0))
    ab_ok = pc.is_valid(ab)
    keep = pc.and_(pc.and_(dc_ok, py_ok), ab_ok)
    n_drop = n0 - _i64_sum(keep)
    t = t.filter(keep)
    log("")
    log("=== hcp_prescribing_activity.csv ===")
    log(
        f"Removed {n_drop:,} rows with null/empty distribution_channel, null/empty payer, or null abandoned "
        f"({n0:,} → {t.num_rows:,})"
    )
    write_table_csv(t, LIB / "hcp_prescribing_activity.csv")
    log(f"Wrote hcp_prescribing_activity.csv ({t.num_rows:,} rows, {len(t.column_names)} columns)")

    # --- hcp_specialty_zip: drop bad imsid rows, drop ped_ic_exclusion, strip literal "NULL" strings ---
    t = read_library_table("hcp_specialty_zip")
    n0 = t.num_rows
    imsid_ok = imsid_row_usable(t["imsid"])
    n_drop_ims = n0 - _i64_sum(imsid_ok)
    t = t.filter(imsid_ok)
    t = drop_columns(t, "ped_ic_exclusion")
    t = replace_literal_null_tokens_in_strings(t)
    log("")
    log("=== hcp_specialty_zip.csv ===")
    log(
        f"Removed {n_drop_ims:,} rows with null/empty imsid or imsid = literal 'NULL' (any case); "
        f"replaced literal 'NULL' in other string columns with empty; dropped ped_ic_exclusion "
        f"({n0:,} → {t.num_rows:,})"
    )
    write_table_csv(t, LIB / "hcp_specialty_zip.csv")
    log(f"Wrote hcp_specialty_zip.csv ({t.num_rows:,} rows, {len(t.column_names)} columns)")

    # --- sales_rep_call_activity ---
    t = read_library_table("sales_rep_call_activity")
    n0 = t.num_rows
    t = drop_columns(t, "relative_call_date")
    t = with_replaced_columns(t, call_date=to_yyyy_mm_dd(t.column("call_date")))
    npi = t["npi"]
    zipc = t["zip"]
    npi_str = pc.cast(npi, pa.string()) if pa.types.is_integer(npi.type) else npi
    zip_str = pc.cast(zipc, pa.string()) if pa.types.is_integer(zipc.type) else zipc
    npi_ok = pc.and_(pc.is_valid(npi_str), pc.greater(pc.utf8_length(pc.utf8_trim_whitespace(npi_str)), 0))
    zip_ok = pc.and_(pc.is_valid(zip_str), pc.greater(pc.utf8_length(pc.utf8_trim_whitespace(zip_str)), 0))
    keep = pc.and_(npi_ok, zip_ok)
    n_drop = n0 - _i64_sum(keep)
    t = t.filter(keep)
    log("")
    log("=== sales_rep_call_activity.csv ===")
    log(f"Removed {n_drop:,} rows with null/empty npi or null/empty zip ({n0:,} → {t.num_rows:,})")
    write_table_csv(t, LIB / "sales_rep_call_activity.csv")
    log(f"Wrote sales_rep_call_activity.csv ({t.num_rows:,} rows, {len(t.column_names)} columns)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
