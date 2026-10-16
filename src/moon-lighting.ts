/** Pixel math shared by the canvas renderer and its phase/texture regressions. */
export interface MoonRaster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
const clamp = (n: number, low = 0, high = 1) => Math.max(low, Math.min(high, n));

/** Percentage placement shared with the independent full-disc star-occlusion mask. */
export function getMoonPlacement(sky: { moonAzimuth: number; moonAltitude: number }): { left: number; top: number } {
  return { left: 78 + Math.sin(sky.moonAzimuth * Math.PI / 180) * 8,
    top: Math.max(9, 44 - Math.max(0, sky.moonAltitude) * .37) };
}

function sample(raster: MoonRaster, u: number, v: number): [number, number, number] {
  const px = clamp(u) * (raster.width - 1), py = clamp(v) * (raster.height - 1);
  const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(x0 + 1, raster.width - 1), y1 = Math.min(y0 + 1, raster.height - 1);
  const fx = px - x0, fy = py - y0;
  const channel = (c: number) => {
    const a = raster.data[(y0 * raster.width + x0) * 4 + c] * (1 - fx) + raster.data[(y0 * raster.width + x1) * 4 + c] * fx;
    const b = raster.data[(y1 * raster.width + x0) * 4 + c] * (1 - fx) + raster.data[(y1 * raster.width + x1) * 4 + c] * fx;
    return a * (1 - fy) + b * fy;
  };
  return [channel(0), channel(1), channel(2)];
}

export function renderMoonPixels({ size, illumination, waxing, rotation, transmission, texture }: {
  size: number; illumination: number; waxing: boolean; rotation: number; transmission: number;
  texture: MoonRaster | null;
}): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(size * size * 4);
  const radius = size * .475;
  const lightZ = 2 * clamp(illumination) - 1;
  const lightX = Math.sqrt(Math.max(0, 1 - lightZ * lightZ)) * (waxing ? 1 : -1);
  const angle = rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const screenX = (x + .5 - size / 2) / radius, screenY = (y + .5 - size / 2) / radius;
    const distance = screenX * screenX + screenY * screenY;
    if (distance > 1) continue;
    // Rotate the sphere/light in place rather than the canvas or its external mask.
    const nx = screenX * cos + screenY * sin, ny = -screenX * sin + screenY * cos;
    const nz = Math.sqrt(Math.max(0, 1 - distance));
    const light = Math.max(0, nx * lightX + nz * lightZ);
    // NASA's equirectangular near side is centered on longitude zero, north up.
    const albedo = texture ? sample(texture, .5 + Math.atan2(nx, nz) / (2 * Math.PI), .5 + Math.asin(clamp(ny, -1, 1)) / Math.PI) : [211, 208, 198];
    const edge = clamp(light / .035);
    const phaseAlpha = edge * edge * (3 - 2 * edge) * clamp(transmission);
    // Gentle diffuse shading preserves the real maria/crater contrast in the albedo.
    const shade = .45 + .55 * Math.sqrt(light);
    const index = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) pixels[index + c] = albedo[c] * shade;
    // Only illuminated lunar surface belongs here. The separate star-field mask
    // occludes the full disc; the dark side never paints a sky-coloured circle.
    pixels[index + 3] = Math.round(clamp((1 - Math.sqrt(distance)) * radius) * phaseAlpha * 255);
  }
  return pixels;
}
