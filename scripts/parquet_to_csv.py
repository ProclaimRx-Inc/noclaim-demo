#!/usr/bin/env python3
"""Convert a Parquet file to UTF-8 CSV for the static library (RFC-style quoting).

Requires: pip install pyarrow

Example:
  python3 -m venv .venv-parquet && . .venv-parquet/bin/activate && pip install pyarrow
  python scripts/parquet_to_csv.py public/library/foo.parquet public/library/foo.csv
"""
from __future__ import annotations

import argparse
import csv
import io
from pathlib import Path

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq


def table_with_timestamps_as_strings(t: pa.Table) -> pa.Table:
    """Timestamp scalars may not round-trip through as_py() (e.g. ns); cast to string once."""
    arrays = []
    for j in range(t.num_columns):
        col = t.column(j)
        if pa.types.is_timestamp(col.type):
            arrays.append(pc.cast(col, pa.string()))
        else:
            arrays.append(col)
    return pa.Table.from_arrays(arrays, names=t.column_names)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("input_parquet", type=Path, help="Source .parquet path")
    p.add_argument("output_csv", type=Path, help="Destination .csv path")
    args = p.parse_args()

    t = table_with_timestamps_as_strings(pq.read_table(args.input_parquet))
    cols = t.column_names
    buf = io.StringIO(newline="")
    w = csv.writer(buf, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
    w.writerow(cols)
    for i in range(t.num_rows):
        row: list[str] = []
        for j in range(t.num_columns):
            v = t.column(j)[i].as_py()
            s = "" if v is None else str(v)
            s = s.replace("\r\n", "\n").replace("\r", "\n")
            row.append(s)
        w.writerow(row)
    args.output_csv.write_text(buf.getvalue(), encoding="utf-8")
    print(f"Wrote {args.output_csv} ({t.num_rows} rows, {len(cols)} columns)")


if __name__ == "__main__":
    main()
