import { useEffect, useRef } from 'react';
import type { SkyState } from './scene-astronomy';

/** A shaded sphere: the terminator is calculated, never baked into a backdrop. */
export function Moon({ sky, opacity }: { sky: SkyState | null; opacity: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context || !sky) return;
    const size = 160, r = 76;
    const pixels = context.createImageData(size, size);
    const lightZ = 2 * sky.illumination - 1;
    const lightX = Math.sqrt(Math.max(0, 1 - lightZ * lightZ)) * (sky.waxing ? 1 : -1);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const nx = (x + .5 - size / 2) / r, ny = (y + .5 - size / 2) / r;
      const distance = nx * nx + ny * ny;
      if (distance > 1) continue;
      const nz = Math.sqrt(1 - distance);
      const lit = Math.max(0, nx * lightX + nz * lightZ);
      const texture = .95 + .025 * Math.sin(nx * 29 + Math.cos(ny * 17) * 3) + .025 * Math.cos(nx * 13 - ny * 24);
      const brightness = (.055 + .945 * Math.min(1, lit * 3.5)) * texture;
      const i = (y * size + x) * 4;
      pixels.data[i] = 239 * brightness;
      pixels.data[i + 1] = 231 * brightness;
      pixels.data[i + 2] = 211 * brightness;
      pixels.data[i + 3] = Math.round(Math.min(1, (1 - Math.sqrt(distance)) * r) * 255);
    }
    context.putImageData(pixels, 0, 0);
  }, [sky]);
  if (!sky) return null;
  // The painting has no geographic compass bearing. Preserve a readable right-hand sky
  // composition while mapping real altitude and a limited azimuth drift into that window.
  const left = 78 + Math.sin(sky.moonAzimuth * Math.PI / 180) * 8;
  const top = Math.max(9, 44 - Math.max(0, sky.moonAltitude) * .37);
  return <div className="scene-moon" aria-hidden="true" data-phase={sky.phaseName} style={{ left: `${left}%`, top: `${top}%`, opacity }}>
    <canvas ref={canvas} width={160} height={160} style={{ transform: `rotate(${sky.moonRotation}deg)` }}/>
  </div>;
}
