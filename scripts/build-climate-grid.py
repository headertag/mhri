#!/usr/bin/env python3
"""Repackage the publisher's 0.1-degree Köppen grid without altering its cells.

Build-only dependency: Pillow==12.1.1. The application runtime uses native Node.
The source archive is pinned by SHA256; no geographic exceptions are applied.
"""

import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import shutil
import tempfile
import urllib.request
import zipfile

from PIL import Image


ARCHIVE_URL = "https://ndownloader.figshare.com/files/61012822"
ARCHIVE_SHA256 = "bb84453d4541f1a0bc5a804ead83f483c19ce70f16a5197f6d3a7b6a63e65562"
TIFF_MEMBER = "1991_2020/koppen_geiger_0p1.tif"
TIFF_SHA256 = "59b749fe6711e72c720ff903044eb0efb4373524ee434740ed7384a0284c155b"
STEM = "koppen-geiger-1991-2020-0p1"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def build(archive, destination):
    with archive.open("rb") as source_file:
        archive_hash = hashlib.file_digest(source_file, "sha256").hexdigest()
    if archive_hash != ARCHIVE_SHA256:
        raise ValueError("Source archive SHA256 mismatch; refusing an unpinned dataset")
    with zipfile.ZipFile(archive) as source:
        tiff = source.read(TIFF_MEMBER)
        legend = source.read("legend.txt")
    if sha256(tiff) != TIFF_SHA256:
        raise ValueError("Source TIFF SHA256 mismatch")
    with Image.open(io.BytesIO(tiff)) as image:
        if image.mode != "P" or image.size != (3600, 1800):
            raise ValueError("Expected an 8-bit indexed 3600 by 1800 source grid")
        if tuple(image.tag_v2[33550]) != (0.1, 0.1, 0.0):
            raise ValueError("Unexpected geographic pixel scale")
        if tuple(image.tag_v2[33922]) != (0.0, 0.0, 0.0, -180.0, 90.0, 0.0):
            raise ValueError("Unexpected geographic origin")
        keys = tuple(image.tag_v2[34735])
        entries = [keys[i:i + 4] for i in range(4, len(keys), 4)]
        if (2048, 0, 1, 4326) not in entries or (1025, 0, 1, 1) not in entries:
            raise ValueError("Expected EPSG:4326 with PixelIsArea registration")
        # Palette indices are the classification, not luminance or RGB values.
        data = image.tobytes()
    if len(data) != 6_480_000 or max(data) > 30:
        raise ValueError("Unexpected classification bytes")
    classes = {int(value): code for value, code in re.findall(r"^\s*(\d+):\s+(\w+)\s", legend.decode("utf8"), re.M)}
    if set(classes) != set(range(1, 31)):
        raise ValueError("Incomplete source legend")
    # Fixed mtime and omitted original filename make the compressed bytes stable.
    output = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=output, compresslevel=9, mtime=0) as compressed:
        compressed.write(data)
    packed = output.getvalue()
    metadata = {
        "schemaVersion": 1,
        "title": "Köppen–Geiger climate classification, 1991–2020",
        "citation": "Beck et al. (2023), Scientific Data 10, 724; corrected January 2026",
        "source": "Beck et al. (2023), V3 (2026), 1991–2020",
        "paperDoi": "https://doi.org/10.1038/s41597-023-02549-6",
        "datasetDoi": "https://doi.org/10.6084/m9.figshare.21789074.v2",
        "datasetVersion": "GloH2O V3; Figshare article version 2, published 2026-01-14",
        "license": "CC BY 4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "archiveUrl": ARCHIVE_URL,
        "archiveSha256": ARCHIVE_SHA256,
        "archiveMember": TIFF_MEMBER,
        "sourceTiffSha256": TIFF_SHA256,
        "sourceLegendSha256": sha256(legend),
        "derivation": "Lossless repackaging of publisher-supplied 0.1-degree categorical raster into row-major unsigned bytes; no additional resampling or geographic overrides",
        "crs": "EPSG:4326",
        "registration": "PixelIsArea",
        "width": 3600,
        "height": 1800,
        "resolutionDegrees": 0.1,
        "west": -180,
        "north": 90,
        "rowOrder": "north-to-south",
        "columnOrder": "west-to-east",
        "noData": 0,
        "byteLength": len(data),
        "rawSha256": sha256(data),
        "gzipSha256": sha256(packed),
        "classes": {"0": "unmapped", **{str(key): value for key, value in classes.items()}},
    }
    destination.mkdir(parents=True, exist_ok=True)
    (destination / f"{STEM}.bin.gz").write_bytes(packed)
    (destination / f"{STEM}.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    (destination / "koppen-geiger-legend.txt").write_bytes(legend)
    print(f"Wrote {len(data):,} cells, {len(packed):,} compressed bytes; raw SHA256 {metadata['rawSha256']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, help="Existing pinned koppen_geiger_tif.zip; otherwise download it")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "server" / "data")
    arguments = parser.parse_args()
    if arguments.archive:
        build(arguments.archive, arguments.output)
    else:
        with tempfile.TemporaryDirectory(prefix="mhri-climate-build-") as directory:
            archive = Path(directory) / "koppen_geiger_tif.zip"
            with urllib.request.urlopen(ARCHIVE_URL, timeout=120) as response, archive.open("wb") as destination:
                shutil.copyfileobj(response, destination)
            build(archive, arguments.output)


if __name__ == "__main__":
    main()
