import { useEffect, useRef } from 'react';
import type { SkyState } from './scene-astronomy';
import { getMoonPlacement, renderMoonPixels, type MoonRaster } from './moon-lighting';

let lunarAlbedo: Promise<MoonRaster | null> | null = null;
function loadAlbedo(): Promise<MoonRaster | null> {
  if (lunarAlbedo) return lunarAlbedo;
  const promise = new Promise<MoonRaster | null>(resolve => {
    const image = new Image();
    image.decoding = 'async';
    const done = (result: MoonRaster | null) => { image.onload = null; image.onerror = null; resolve(result); };
    image.onerror = () => done(null);
    image.onload = () => {
      try {
        const width = Math.min(1024, image.naturalWidth);
        const height = Math.max(1, Math.round(width * image.naturalHeight / image.naturalWidth));
        const surface = document.createElement('canvas');
        surface.width = width; surface.height = height;
        const context = surface.getContext('2d', { willReadFrequently: true });
        if (!context) { done(null); return; }
        context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, width, height);
        done({ width, height, data: context.getImageData(0, 0, width, height).data });
      } catch { done(null); }
    };
    image.src = '/art/moon-albedo.webp';
  });
  lunarAlbedo = promise;
  // A failed request can recover on the next scene update; successful texture is reused.
  void promise.then(result => { if (!result && lunarAlbedo === promise) lunarAlbedo = null; });
  return promise;
}

/** Real lunar albedo with a calculated terminator, composited as illuminated pixels only. */
export function Moon({ sky, opacity }: { sky: SkyState | null; opacity: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const surface = canvas.current;
    const context = surface?.getContext('2d');
    if (!surface || !context) return;
    context.clearRect(0, 0, surface.width, surface.height);
    if (!sky || opacity <= 0) return;
    let active = true;
    let texture: MoonRaster | null = null;
    const draw = () => {
      if (!active) return;
      const bounds = surface.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const size = Math.min(192, Math.max(96, Math.ceil(bounds.width * Math.min(window.devicePixelRatio || 1, 2))));
      surface.width = size; surface.height = size;
      const pixels = context.createImageData(size, size);
      pixels.data.set(renderMoonPixels({ size, illumination: sky.illumination, waxing: sky.waxing,
        rotation: sky.moonRotation, transmission: opacity, texture }));
      context.putImageData(pixels, 0, 0);
    };
    draw();
    void loadAlbedo().then(albedo => { if (active) { texture = albedo; draw(); } });
    const resize = new ResizeObserver(draw);
    resize.observe(surface);
    return () => { active = false; resize.disconnect(); };
  }, [sky, opacity]);
  if (!sky) return null;
  // The painting has no geographic compass bearing. Preserve a readable right-hand sky
  // composition while mapping real altitude and a limited azimuth drift into that window.
  const { left, top } = getMoonPlacement(sky);
  return <div className="scene-moon" aria-hidden="true" data-phase={sky.phaseName} style={{ left: `${left}%`, top: `${top}%`, opacity: opacity > 0 ? 1 : 0, filter: 'none' }}>
    <canvas ref={canvas} width={160} height={160}/>
  </div>;
}
