import { deformClothPoint, type FigurePoint } from './figure-motion.ts';

// Receiver inferred from the painted toe contacts, in the 798 × 1260 artwork.
// Light comes from upper left; the cast runs rightward and away into the scene.
export const SHADOW_LIGHT = { groundY: 1114, groundSlope: .2, castX: .7, castY: -.2, depthFalloff: 145 };
// Fade completely on the near ground, with padding beyond the transparent edges.
export const SHADOW_FADE = { startX: 510, endX: 760, backY: 1090, groundY: 1140 };
export const SHADOW_BOUNDS = { x: 80, y: 1050, width: 740, height: 220 };
export const SHADOW_BANDS = [
  { min: -Infinity, max: 115, blur: 1.25 },
  { min: 85, max: 440, blur: 3.5 },
  { min: 400, max: Infinity, blur: 7.5 },
];

export function heightAboveGround(point: FigurePoint) {
  return Math.max(0, SHADOW_LIGHT.groundY + point.x * SHADOW_LIGHT.groundSlope - point.y);
}

export function projectShadowPoint(point: FigurePoint): FigurePoint {
  const height = heightAboveGround(point);
  return {
    x: point.x + height * SHADOW_LIGHT.castX,
    // Foreshorten the receding receiver: higher parts cast farther right,
    // but converge into a shallow ground band, as in the painted reference.
    y: point.y + height + height * SHADOW_LIGHT.castY / (1 + height / SHADOW_LIGHT.depthFalloff),
  };
}

/** Sample the existing absolute SVG matte; this is the figure, not a new shadow outline. */
export function sampleContour(path: string): FigurePoint[] {
  const tokens = path.match(/[a-zA-Z]|-?\d+(?:\.\d+)?/g) ?? [];
  const points: FigurePoint[] = [];
  let cursor = 0, current = { x: 0, y: 0 };
  const readPoint = () => ({ x: Number(tokens[cursor++]), y: Number(tokens[cursor++]) });
  const distance = (a: FigurePoint, b: FigurePoint) => Math.hypot(b.x - a.x, b.y - a.y);
  while (cursor < tokens.length) {
    const command = tokens[cursor++];
    if (command === 'Z') break;
    if (command === 'M') { current = readPoint(); points.push(current); continue; }
    if (!['L', 'Q', 'C'].includes(command)) throw new Error(`Unsupported matte command: ${command}`);
    const control1 = readPoint();
    const control2 = command === 'C' ? readPoint() : control1;
    const end = command === 'L' ? control1 : readPoint();
    const length = command === 'L' ? distance(current, end)
      : distance(current, control1) + distance(control1, control2) + distance(control2, end);
    const steps = Math.max(1, Math.ceil(length / 3));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, s = 1 - t;
      const axis = (key: 'x' | 'y') => command === 'L' ? current[key] * s + end[key] * t
        : command === 'Q' ? current[key] * s * s + 2 * s * t * control1[key] + end[key] * t * t
        : current[key] * s ** 3 + 3 * s * s * t * control1[key] + 3 * s * t * t * control2[key] + end[key] * t ** 3;
      points.push({ x: axis('x'), y: axis('y') });
    }
    current = end;
  }
  return points;
}

/** Clip a caster to a height band, before flattening it onto the receiver. */
export function clipHeight(points: FigurePoint[], height: number, above: boolean): FigurePoint[] {
  if (!Number.isFinite(height)) return points;
  const value = (p: FigurePoint) => SHADOW_LIGHT.groundY + p.x * SHADOW_LIGHT.groundSlope - p.y - height;
  const output: FigurePoint[] = [];
  let previous = points.at(-1);
  if (!previous) return output;
  let previousValue = value(previous), previousInside = above ? previousValue >= 0 : previousValue <= 0;
  for (const point of points) {
    const nextValue = value(point), nextInside = above ? nextValue >= 0 : nextValue <= 0;
    if (nextInside !== previousInside) {
      const t = previousValue / (previousValue - nextValue);
      output.push({ x: previous.x + (point.x - previous.x) * t, y: previous.y + (point.y - previous.y) * t });
    }
    if (nextInside) output.push(point);
    previous = point; previousValue = nextValue; previousInside = nextInside;
  }
  return output;
}

export function createFigureShadow(canvas: HTMLCanvasElement, figure: string, staff: string) {
  const context = canvas.getContext('2d');
  if (!context) return null;
  const silhouettes = [sampleContour(figure), sampleContour(staff)];
  let lastTime = 0, lastMotion = false, lastDraw = -Infinity;

  const render = (time: number, motion: boolean, force = false) => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    const resized = canvas.width !== width || canvas.height !== height;
    if (resized) { canvas.width = width; canvas.height = height; }
    if (!force && !resized && motion === lastMotion && (!motion || time - lastDraw < 1 / 30)) return;
    lastTime = time; lastMotion = motion; lastDraw = time;
    const scaleX = width / SHADOW_BOUNDS.width, scaleY = height / SHADOW_BOUNDS.height;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = 'source-over';
    context.filter = 'none';
    context.clearRect(0, 0, width, height);
    const casters = silhouettes.map((points, index) => index === 0
      ? points.map(point => deformClothPoint(point, time, motion)) : points);
    context.setTransform(scaleX, 0, 0, scaleY, -SHADOW_BOUNDS.x * scaleX, -SHADOW_BOUNDS.y * scaleY);
    context.fillStyle = 'white';
    for (const band of SHADOW_BANDS) {
      context.filter = `blur(${band.blur * (scaleX + scaleY) / 2}px)`;
      for (const caster of casters) {
        const polygon = clipHeight(clipHeight(caster, band.min, true), band.max, false).map(projectShadowPoint);
        if (polygon.length < 3) continue;
        context.beginPath();
        context.moveTo(polygon[0].x, polygon[0].y);
        for (const point of polygon.slice(1)) context.lineTo(point.x, point.y);
        context.closePath();
        context.fill();
      }
    }
    // Union the caster masks first, then apply density once. Overlapping limbs
    // and height bands must not accumulate into several dark drop shadows.
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.filter = 'none';
    context.globalCompositeOperation = 'source-in';
    const density = context.createLinearGradient(
      (SHADOW_FADE.startX - SHADOW_BOUNDS.x) * scaleX, 0,
      (SHADOW_FADE.endX - SHADOW_BOUNDS.x) * scaleX, 0);
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, fade = 1 - t * t * (3 - 2 * t);
      density.addColorStop(t, `rgba(20,22,15,${.64 * fade})`);
    }
    context.fillStyle = density;
    context.fillRect(0, 0, width, height);
    // Apply the finite receiver after blur, so no soft pixels spill onto the
    // water/trees. Its back edge also eases to zero instead of cutting off.
    context.globalCompositeOperation = 'destination-in';
    const receiver = context.createLinearGradient(0,
      (SHADOW_FADE.backY - SHADOW_BOUNDS.y) * scaleY, 0,
      (SHADOW_FADE.groundY - SHADOW_BOUNDS.y) * scaleY);
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, opacity = t * t * (3 - 2 * t);
      receiver.addColorStop(t, `rgba(255,255,255,${opacity})`);
    }
    context.fillStyle = receiver;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'source-over';
  };
  const observer = new ResizeObserver(() => render(lastTime, lastMotion, true));
  observer.observe(canvas);
  render(0, false, true);
  return { render, dispose: () => { observer.disconnect(); context.clearRect(0, 0, canvas.width, canvas.height); } };
}
