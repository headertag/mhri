# Lunar surface imagery

`public/art/moon-albedo.webp` is a web-sized derivative of NASA's 2025 lunar color map from the [CGI Moon Kit, SVS item 4720](https://svs.gsfc.nasa.gov/4720/). It supplies real lunar surface detail; it is not an AI-generated image or a photograph of a particular lunar phase.

Credit: **NASA's Scientific Visualization Studio**. Visualization: Ernie Wright (USRA). Source measurements: Lunar Reconnaissance Orbiter Camera (LROC) and Lunar Orbiter Laser Altimeter (LOLA).

## Source and projection

The [downloaded NASA JPEG](https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg) was linked directly from the 2025 color-map section, inspected and retrieved on 16 October 2026. NASA describes it as a base-color map for sphere rendering, centered on 0° longitude. The 2:1 longitude/latitude texture is equirectangular, with north at the top and the near-side central meridian in the middle.

NASA assembled the map from LROC's normalized multi-image mosaic, with LOLA albedo filling the polar gaps. Its color balance and small missing-data corrections favor visualization, not scientific measurement. The source is described on the linked NASA page.

## Rights and attribution

NASA's [Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) state that NASA texture maps generally are not subject to US copyright and permit informational web and graphical-simulation use with acknowledgment. The selected item identifies no separate third-party copyright restriction. This texture remains NASA-sourced material under those guidelines; MHRI does not claim exclusive rights to it. NASA logos and endorsement are not included or implied.

## Preparation and integrity

Only size and format were changed: Lanczos3 downsampling to 1024 × 512, followed by lossy WebP encoding at quality 86, effort 6. The derivative is opaque RGB; the application's sphere renderer supplies the limb, phase shading and transparency. No artificial craters, color grading or extra surface detail were added to the asset.

| File | Dimensions | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| NASA `lroc_color_2k.jpg` | 2048 × 1024 | 457,942 | `f7130a1822681fa7512d7dcfd40db8c10b9ba4f06777910348698260ed7a2170` |
| MHRI `moon-albedo.webp` | 1024 × 512 | 89,298 | `de3eeef21c8eddee7eb69f6fd390dba6c8c4e10a14cdd4843ab5ac1bc6478f08` |

Preparation used Sharp 0.35.5 and libwebp 1.6.0:

```js
await sharp(sourceBytes)
  .resize(1024, 512, { fit: 'fill', kernel: 'lanczos3' })
  .webp({ quality: 86, effort: 6 })
  .toFile('public/art/moon-albedo.webp');
```

For a fixed near-side sphere, a normalized surface vector with positive `z` toward the viewer, positive `x` right, and positive `y` north maps to `u = 0.5 + atan2(x, z) / (2π)` and `v = 0.5 - asin(y) / π`. A canvas whose positive `y` points downward must invert that component. Sampling the map this way gives a recognizable near-side face; it does not calculate lunar libration or provide a date-specific lunar photograph. The runtime phase and sky orientation are separate application calculations, and the result remains a compositional depiction within the painting.
