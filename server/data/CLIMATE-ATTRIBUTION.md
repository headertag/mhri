# Köppen–Geiger climate data attribution

Climate classification data © the authors; licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

Beck, H. E., T. R. McVicar, N. Vergopolan, A. Berg, N. J. Lutsko, A. Dufour, Z. Zeng, X. Jiang, A. I. J. M. van Dijk, and D. G. Miralles. **High-resolution (1 km) Köppen-Geiger maps for 1901–2099 based on constrained CMIP6 projections.** *Scientific Data* **10**, 724 (2023). [https://doi.org/10.1038/s41597-023-02549-6](https://doi.org/10.1038/s41597-023-02549-6).

Source: [Figshare dataset version 2](https://doi.org/10.6084/m9.figshare.21789074.v2), released 14 January 2026; described by [GloH2O](https://www.gloh2o.org/koppen/) as the corrected V3 maps. Dataset period used: **1991–2020**, publisher-supplied **0.1°** classification raster.

MHRI changes: lossless format conversion from the categorical GeoTIFF to a gzip-compressed row-major byte array. Cell classifications are unchanged. Runtime lookup adds a bounded, explicitly labeled nearest-land fallback for unmapped coastal coordinates, and groups detailed Köppen classes into broad scene-selection categories. These scene categories are an MHRI interpretation, not a supplied vegetation or biome dataset. No endorsement by the dataset authors is implied.

The original legend is retained in `koppen-geiger-legend.txt`. Full source identifiers, hashes and grid geometry are recorded in `koppen-geiger-1991-2020-0p1.json`. The CC BY 4.0 data license applies to the data and these derived data files, independently of the application code's license.
