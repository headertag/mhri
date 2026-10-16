import { useEffect, useRef, type CSSProperties } from 'react';
import type { SkyPeriod, WeatherState } from './scene-astronomy';
import './weather-effects.css';

export interface WeatherEffectsProps {
  weather: WeatherState;
  motion: boolean;
  windSpeedKmh: number;
  windDirectionDeg: number;
  period: SkyPeriod;
}

type Particle = { x: number; y: number; depth: number; phase: number; speed: number; size: number };
type Ripple = { x: number; y: number; phase: number; radius: number };
const bounded = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

/** A painted atmosphere: restrained, silent, and deliberately less opaque over the face. */
export function WeatherEffects({ weather, motion, windSpeedKmh, windDirectionDeg, period }: WeatherEffectsProps) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { kind, precipitation, intensity } = weather;

  useEffect(() => {
    const host = root.current;
    const surface = canvas.current;
    if (!host) return;
    const context = surface?.getContext('2d');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0, height = 0, ratio = 1, frame = 0, previous = 0, elapsed = 0;
    let particles: Particle[] = [];
    let ripples: Ripple[] = [];
    let disposed = false;
    const amount = bounded(intensity, 0, 1);
    const snow = precipitation === 'snow';
    const hail = precipitation === 'hail';
    const drizzle = kind === 'drizzle';
    const night = period === 'night';
    const hasParticles = precipitation !== 'none' && amount > 0;
    const wind = bounded(windSpeedKmh, 0, 90);
    const windAngle = (Number.isFinite(windDirectionDeg) ? windDirectionDeg : 0) * Math.PI / 180;
    // This is a stylized horizontal projection: the painted landscape has no compass bearing.
    const windAcross = -Math.sin(windAngle) * Math.min(wind, 65) * (snow ? 1.1 : 1.6);
    const animated = () => motion && !reducedMotion.matches;

    function resize() {
      if (!surface || !context) return;
      const bounds = host!.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      if (width <= 0 || height <= 0) return;
      // Cap both density and backing-store size, including very wide desktop screens.
      ratio = Math.min(window.devicePixelRatio || 1, 1.5, 2400 / Math.max(width, height));
      surface.width = Math.max(1, Math.round(width * ratio));
      surface.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const mobile = width <= 700;
      const density = Math.sqrt(width * height / 900_000);
      const count = hasParticles ? Math.round(bounded((snow ? 92 : 126) * density * (0.3 + amount * 0.7), 14, mobile ? 82 : 160)) : 0;
      particles = Array.from({ length: count }, () => {
        const depth = 0.2 + Math.random() * 0.8;
        return {
          x: Math.random() * width, y: Math.random() * height, depth,
          phase: Math.random() * Math.PI * 2,
          speed: snow ? 13 + depth * 30 : (drizzle ? 120 : 260) + depth * (hail ? 230 : 330),
          size: snow ? 0.6 + depth * 1.7 : hail ? 0.65 + depth * 1.1 : 0.45 + depth * 0.5,
        };
      });
      ripples = !snow && hasParticles ? Array.from({ length: mobile ? 10 : 20 }, () => ({
        x: Math.random() * width,
        y: height * (0.78 + Math.random() * 0.2),
        phase: Math.random(), radius: 3 + Math.random() * 6,
      })) : [];
      draw(0);
    }

    function portraitTransmission(x: number, y: number) {
      // A broad, feathered opening around the head keeps the original face and sheep readable.
      const mobilePortrait = width <= 700 && height > width;
      const headX = width * 0.52;
      const headY = height * (mobilePortrait ? 0.285 : 0.18);
      const dx = (x - headX) / Math.min(width * 0.22, 150);
      const dy = (y - headY) / Math.min(height * 0.15, 140);
      return 0.24 + 0.76 * bounded((dx * dx + dy * dy) / 1.8, 0, 1);
    }

    function draw(delta: number) {
      if (!surface || !context || !width || !height) return;
      context.clearRect(0, 0, width, height);
      elapsed += delta;
      context.lineCap = 'round';
      context.strokeStyle = night ? '#b8c2c8' : '#d4d4c4';
      context.fillStyle = snow ? (night ? '#c8ced0' : '#ede7d5') : '#cfd4d0';

      for (const particle of particles) {
        const drift = windAcross * (0.45 + particle.depth * 0.55)
          + (snow ? Math.sin(elapsed * 0.6 + particle.phase) * 9 : 0);
        particle.x += drift * delta;
        particle.y += particle.speed * delta;
        if (particle.y > height + 20) { particle.y = -20; particle.x = Math.random() * width; }
        if (particle.x < -24) particle.x = width + 20;
        if (particle.x > width + 24) particle.x = -20;
        const portrait = portraitTransmission(particle.x, particle.y);
        const alpha = (snow ? 0.18 + particle.depth * 0.4 : 0.09 + particle.depth * 0.17)
          * portrait * (night ? 0.8 : 1) * (0.7 + amount * 0.3);
        context.globalAlpha = alpha;

        if (snow || hail) {
          context.beginPath();
          context.ellipse(particle.x, particle.y, particle.size, particle.size * (snow ? 0.78 : 1.2), particle.phase, 0, Math.PI * 2);
          context.fill();
          // A low-opacity outer stroke keeps close snow soft without a blurred screen overlay.
          if (snow && particle.depth > 0.7) {
            context.globalAlpha = alpha * 0.24;
            context.lineWidth = 1.3;
            context.stroke();
          }
        } else {
          const length = (drizzle ? 3 : 7) + particle.depth * (drizzle ? 5 : 13);
          const lean = drift / particle.speed * length;
          context.lineWidth = particle.size;
          context.beginPath();
          context.moveTo(particle.x - lean, particle.y - length);
          context.lineTo(particle.x, particle.y);
          context.stroke();
        }
      }

      // Small interrupted ellipses on the ground; never splashes over the figure or sky.
      if (ripples.length) {
        context.save();
        context.beginPath();
        context.rect(0, height * 0.75, width, height * 0.25);
        context.clip();
        context.lineWidth = 0.65;
        for (const ripple of ripples) {
          const age = (ripple.phase + elapsed * (drizzle ? 0.5 : 0.8)) % 1;
          const radius = 1 + age * ripple.radius;
          context.globalAlpha = Math.sin(age * Math.PI) * (1 - age) * amount * (night ? 0.12 : 0.18);
          context.beginPath();
          context.ellipse(ripple.x, ripple.y, radius, radius * 0.22, 0, 0.15, Math.PI * 1.65);
          context.stroke();
        }
        context.restore();
      }
      context.globalAlpha = 1;
    }

    function animate(now: number) {
      if (disposed || document.hidden || !animated()) return;
      const since = previous ? now - previous : 0;
      // Thirty painted frames per second are sufficient for this subdued atmosphere.
      if (!previous || since >= 1000 / 30) {
        draw(previous ? Math.min(since / 1000, 0.06) : 0);
        previous = now;
      }
      frame = requestAnimationFrame(animate);
    }

    function updateMotion() {
      cancelAnimationFrame(frame);
      previous = 0;
      host!.dataset.paused = String(document.hidden || !animated());
      if (document.hidden) return;
      if (hasParticles && animated() && context) frame = requestAnimationFrame(animate);
      else draw(0);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    updateMotion();
    document.addEventListener('visibilitychange', updateMotion);
    reducedMotion.addEventListener('change', updateMotion);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', updateMotion);
      reducedMotion.removeEventListener('change', updateMotion);
      context?.clearRect(0, 0, width, height);
    };
  }, [kind, precipitation, intensity, motion, windSpeedKmh, windDirectionDeg, period]);

  const mist = kind === 'fog' ? 0.48 : kind === 'thunderstorm' ? 0.15 : precipitation === 'snow' ? 0.16 : precipitation !== 'none' ? 0.07 + intensity * 0.08 : 0;
  const style = {
    '--weather-mist-opacity': mist,
    '--weather-mist-rgb': period === 'night' ? '109 126 140' : period === 'day' ? '196 197 178' : '195 183 166',
  } as CSSProperties;
  return <div ref={root} className={`weather-effects weather-${kind} ${motion ? 'weather-has-motion' : ''}`} style={style} aria-hidden="true">
    {mist > 0 && <><div className="weather-mist weather-mist-distant"/><div className="weather-mist weather-mist-ground"/></>}
    {precipitation !== 'none' && <canvas ref={canvas} className="weather-particles" aria-hidden="true"/>}
  </div>;
}
