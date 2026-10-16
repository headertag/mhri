# Coordinate-based climate classification

MHRI uses a bundled global Köppen–Geiger grid to inform foliage selection. It does not infer climate from a city name, country, latitude band or IANA time zone. For example, San Francisco and the Sierra Nevada can share a time zone while mapping to different climate classes.

## Source and license

The source is Beck et al. (2023), *High-resolution (1 km) Köppen-Geiger maps for 1901–2099 based on constrained CMIP6 projections*, *Scientific Data* 10, 724, [doi:10.1038/s41597-023-02549-6](https://doi.org/10.1038/s41597-023-02549-6). The [authors' GloH2O data page](https://www.gloh2o.org/koppen/) identifies the latest corrected maps as V3 and explicitly permits use and adaptation under **CC BY 4.0**. The pinned [Figshare article version 2](https://doi.org/10.6084/m9.figshare.21789074.v2), published 14 January 2026, records the correction and the same license.

We use **1991–2020 historical climate normals**, not a future climate scenario or today's weather. The archive includes a publisher-supplied 0.1° raster, approximately 11 km north–south. Full attribution and the modification notice are retained in [server/data/CLIMATE-ATTRIBUTION.md](../server/data/CLIMATE-ATTRIBUTION.md).

## Data preparation

The pinned archive is `https://ndownloader.figshare.com/files/61012822`, SHA256 `bb84453d4541f1a0bc5a804ead83f483c19ce70f16a5197f6d3a7b6a63e65562`.

The selected member is `1991_2020/koppen_geiger_0p1.tif`, SHA256 `59b749fe6711e72c720ff903044eb0efb4373524ee434740ed7384a0284c155b`.

[scripts/build-climate-grid.py](../scripts/build-climate-grid.py) checks both hashes, geographic registration, EPSG:4326, dimensions and class legend. It extracts the existing 8-bit palette indices directly. It performs **no additional resampling**, recoloring, country-specific correction or manually drawn geographic override. The result is 3,600 × 1,800 unsigned bytes, arranged west to east and north to south, origin −180° / 90°, with 0.1° cells. A zero is unmapped, primarily ocean. Values 1–30 follow the retained publisher legend.

The 6,480,000-byte grid compresses to 162,225 bytes. The raw SHA256 is `533e3f2f20ac758ce87014aeb3151e7552432f1146e4bb3022cff9012fb6b047`. Complete provenance and compressed checksum are in [server/data/koppen-geiger-1991-2020-0p1.json](../server/data/koppen-geiger-1991-2020-0p1.json).

To reproduce using Python 3.11 or newer:

```sh
python3 -m venv /tmp/mhri-climate-build
/tmp/mhri-climate-build/bin/python -m pip install Pillow==12.1.1
/tmp/mhri-climate-build/bin/python scripts/build-climate-grid.py
```

The script downloads the pinned 130.6 MB archive into a temporary directory. To reuse an existing download, pass `--archive /path/to/koppen_geiger_tif.zip`. `--output /tmp/climate-rebuild` permits a comparison without replacing the bundled files. The gzip timestamp is fixed to zero; decompressed content is invariant even if a platform's compression implementation differs.

## Runtime contract

`getClimate(latitude, longitude)` in [server/climate-grid.mjs](../server/climate-grid.mjs) accepts finite numbers within latitude [−90, 90] and longitude [−180, 180]. Longitude +180 and −180 address the same meridian. Invalid inputs are not coerced or wrapped arbitrarily.

It returns `{ koppenCode, group, source, confidence }`. Unavailable or invalid points return `koppenCode: null`, `group: 'unknown'`, and `confidence: 'unknown'`. The source string remains present for provenance. The file is decompressed and its SHA256 verified once at module load; requests need no network, GIS library, package dependency or access to user identity. The decoded grid occupies 6.48 MB.

For a mapped cell, `confidence` is `mapped`. An unmapped cell searches at most two cells in each direction (a 5 × 5 window), wraps at the antimeridian, and chooses the nearest mapped cell center **only if it is within 25 km** by great-circle distance. That result is marked `nearby`. The grid is never globally filled over oceans. The finite cell window is intentionally conservative; at high latitudes it may leave some points unknown even when land exists within 25 km. Unknown is preferable to guessing from distant land.

These confidence labels describe lookup provenance, **not** the statistical confidence field supplied in the research dataset. Coarse IP geolocation, coastal cells, mountains and mixed climates can still produce an approximate local classification.

## Scene groups

| Detailed classes | MHRI group |
| --- | --- |
| Af | tropical-rainforest |
| Am, Aw | tropical-seasonal |
| BWh, BWk, BSh, BSk | arid |
| Csa, Csb, Csc | mediterranean |
| Cwa, Cfa | subtropical |
| Cwb, Cwc, Cfb, Cfc | oceanic |
| Dsa, Dsb, Dwa, Dwb, Dfa, Dfb | continental |
| Dsc, Dsd, Dwc, Dwd, Dfc, Dfd | boreal |
| ET, EF | polar |

The `oceanic` presentation group also contains mild-summer subtropical highland classes Cwb/Cwc. The exact Köppen code is always retained so callers can distinguish them. These categories guide an artistic landscape; climate classification is not a direct map of tree species, land cover, irrigation or current leaf phenology.

## Reference checks and limitations

The checked-in tests query actual raster cells rather than fake classifications:

| Coordinates | Location | Raster code | Group |
| --- | --- | --- | --- |
| 34.0522, −118.2437 | Los Angeles | Csa | mediterranean |
| 37.7749, −122.4194 | San Francisco | Csb | mediterranean |
| 37.7450, −119.5330 | Sierra Nevada | Dsb | continental |
| 47.6062, −122.3321 | Seattle | Csb | mediterranean |
| 43.6532, −79.3832 | Toronto | Dfa | continental |
| 1.3521, 103.8198 | Singapore | Af | tropical-rainforest |
| −1.2921, 36.8219 | Nairobi | Aw | tropical-seasonal |
| −0.1807, −78.4678 | Quito | Csb | mediterranean |
| 8.9806, 38.7578 | Addis Ababa | Cwb | oceanic / highland |
| 4.7110, −74.0721 | Bogotá | Cfb | oceanic / highland |

Some familiar city descriptions differ from this particular updated climate-normal dataset. Seattle maps to warm-summer dry-summer Csb, Nairobi to Aw, and Quito to Csb at the stated coordinates. Those three values were also checked against the archive's original approximately 1 km raster; they are not introduced by this application's format conversion. We preserve the dataset result rather than substituting a conventional city label. Addis Ababa and Bogotá demonstrate why equatorial or tropical latitude alone cannot determine a tropical foliage treatment.

Run the focused checks with `node --test server/climate-grid.test.mjs`. Tests cover the sample locations, bounded coastal fallback, distant ocean, antimeridian equivalence, polar limits and invalid inputs.
