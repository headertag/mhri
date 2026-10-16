import type { CSSProperties } from 'react';
import { Moon } from './moon';
import { getMoonPlacement } from './moon-lighting';
import type { SceneEnvironment } from './scene-environment';

// A fixed, transparent artistic star field. It is not an observer's star chart.
// Deterministic positions avoid flicker and require neither a bitmap sky nor a clock.
let seed = 527;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const stars = Array.from({ length: 260 }, (_, i) => ({
  id: i, x: random() * 1600, y: random() * 900,
  radius: .45 + random() ** 3 * .85, opacity: .25 + random() * .65,
}));

/** Sky color, distant objects and moving cloud materials have separate ownership. */
export function SkyLayers({ scene }: { scene: SceneEnvironment }) {
  const moon = scene.sky ? getMoonPlacement(scene.sky) : null;
  const occultation = moon && scene.sky?.moonAboveHorizon
    ? `radial-gradient(circle calc(var(--moon-size) * .475) at ${moon.left}% ${moon.top}%, transparent 98%, #000 100%)`
    : undefined;
  return <div className="celestial-space" aria-hidden="true" style={{'--landscape-mask':`url("${scene.landscapeMask}")`} as CSSProperties}>
    <div className="sky-colour" data-sky-layer="colour" style={{ background: scene.atmosphere.skyGradient }}/>
    <div className="astral-space">
      <svg className="star-field" data-sky-layer="stars" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice"
        style={{ opacity: scene.atmosphere.starOpacity, maskImage: occultation } as CSSProperties}>
        {stars.map(star => <circle key={star.id} cx={star.x} cy={star.y} r={star.radius} fill="#e8e4d8" opacity={star.opacity}/>)}
      </svg>
      <Moon sky={scene.sky} opacity={scene.moonOpacity}/>
    </div>
    <img className="cloud-sky local-clouds" data-sky-layer="clouds" src={scene.cloudImage}
      style={{ filter: scene.atmosphere.cloudFilter, opacity: scene.atmosphere.cloudOpacity }} alt="" draggable="false"/>
  </div>;
}
