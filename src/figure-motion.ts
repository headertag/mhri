export type FigurePoint = { x: number; y: number };

const smoothstep = (low: number, high: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

/** The displayed position of a contour point, using the vertex program below. */
export function deformClothPoint(point: FigurePoint, time: number, motion: boolean): FigurePoint {
  if (!motion) return point;
  const weight = (1 - smoothstep(75, 295, point.x))
    * smoothstep(535, 690, point.y) * (1 - smoothstep(925, 1040, point.y));
  if (!weight) return point;
  const phase = time * .72 - (point.y - 600) * .017 + point.x * .005;
  const breeze = Math.sin(phase) + .22 * Math.sin(phase * 1.63 + 1.1);
  const x = point.x + weight * breeze * 9;
  const y = point.y + weight * Math.cos(phase * .82 + .7) * 4;
  const w = 1 - weight * Math.sin(phase + .45) * 9 / 1600;
  return { x: 399 + (x - 399) / w, y: 630 + (y - 630) / w };
}

// Keep the contour projection above and the vertex equations together. The
// shadow is driven by the mesh clock, including its paused and reduced-motion states.
export const vertexShader = `
  precision highp float;
  attribute vec2 aUV;
  uniform float uTime;
  uniform float uMotion;
  varying vec2 vUV;
  varying float vLight;
  void main() {
    vec2 p = aUV * vec2(798.0, 1260.0);
    // The attachment to the body is pinned. The influence increases towards
    // the free left edge, and vanishes before the feet and upper torso.
    float attachment = 1.0 - smoothstep(75.0, 295.0, p.x);
    float heightBand = smoothstep(535.0, 690.0, p.y)
                     * (1.0 - smoothstep(925.0, 1040.0, p.y));
    float weight = attachment * heightBand * uMotion;
    float phase = uTime * 0.72 - (p.y - 600.0) * 0.017 + p.x * 0.005;
    float breeze = sin(phase) + 0.22 * sin(phase * 1.63 + 1.1);
    p.x += weight * breeze * 9.0;
    p.y += weight * cos(phase * 0.82 + 0.7) * 4.0;
    float z = weight * sin(phase + 0.45) * 9.0;
    vec2 clip = vec2(p.x / 798.0 * 2.0 - 1.0, 1.0 - p.y / 1260.0 * 2.0);
    gl_Position = vec4(clip, -z / 1000.0, 1.0 - z / 1600.0);
    vUV = aUV;
    vLight = 1.0 + weight * cos(phase + 0.45) * 0.012;
  }
`;
