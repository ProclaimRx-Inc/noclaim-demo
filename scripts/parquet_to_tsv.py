#!/usr/bin/env python3
"""Convert a Parquet file to a tab-separated text file (UTF-8) for the static library.

Requires: pip install pyarrow

Example:
  python3 -m venv .venv-parquet && . .venv-parquet/bin/activate && pip install pyarrow
  python scripts/parquet_to_tsv.py public/library/foo.parquet public/library/foo.txt
"""
from __future__ import annotations

import argparse
from pathlib import Path

import pyarrow.parquet as pq


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("input_parquet", type=Path, help="Source .parquet path")
    p.add_argument("output_txt", type=Path, help="Destination .txt path (TSV)")
    args = p.parse_args()

    t = pq.read_table(args.input_parquet)
    cols = t.column_names
    lines: list[str] = ["\t".join(cols)]
    for i in range(t.num_rows):
        cells: list[str] = []
        for j in range(t.num_columns):
            v = t.column(j)[i].as_py()
            s = "" if v is None else str(v)
            s = s.replace("\t", " ").replace("\n", " ").replace("\r", " ")
            cells.append(s)
        lines.append("\t".join(cells))
    args.output_txt.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {args.output_txt} ({t.num_rows} rows, {len(cols)} columns)")


if __name__ == "__main__":
    main()
