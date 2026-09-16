'use client';

import { useEffect, useRef, useState } from 'react';
import { FigureMesh } from './figure-mesh';

// Display masks only. Every visible subject pixel comes from the supplied artwork.
// Trace the wool, grip and tunic hem independently of the staff: the spaces
// between them must stay transparent, including the notch above the right ankle.
const figure = `M 377 105 C 356 104 341 106 323 110 C 286 107 245 124 230 146 L 218 169 L 194 181 L 205 194 L 220 198 C 217 224 226 254 244 274 L 261 302 C 237 322 227 352 218 382 C 202 414 191 456 187 481 Q 185 511 218 522 L 258 535 Q 246 578 213 613 C 174 656 151 691 112 726 L 67 761 L 32 787 Q 62 807 91 811 L 78 825 L 85 849 L 94 868 L 106 884 Q 140 903 162 903 Q 178 899 191 905 Q 203 914 219 914 L 225 911 Q 227 940 233 960 C 238 979 243 990 245 1005 Q 245 1017 268 1019 L 278 1020 L 262 1052 L 247 1081 L 230 1104 Q 218 1116 213 1125 Q 205 1134 192 1142 Q 182 1145 186 1151 Q 192 1156 211 1158 Q 230 1162 248 1153 Q 269 1142 283 1123 L 302 1092 Q 347 1083 366 1068 L 393 1081 L 395 1124 L 396 1161 Q 397 1183 422 1196 L 450 1214 Q 476 1228 496 1212 Q 508 1200 494 1184 L 468 1155 L 455 1142 L 447 1130 L 443 1122 Q 439 1118 435 1122 L 438 1102 L 441 1081 Q 454 1075 459 1067 Q 476 1060 490 1071 Q 502 1082 510 1075 L 508 1044 L 509 1020 L 506 994 Q 503 965 508 942 L 511 917 Q 532 923 534 911 L 534 891 Q 533 880 529 870 L 525 850 L 520 830 L 518 810 L 517 790 L 513 772 Q 512 768 521 760 L 536 740 L 550 720 L 563 700 L 575 680 L 585 660 L 593 640 L 601 620 Q 604 612 597 605 L 592 600 Q 605 614 619 623 Q 630 633 640 633 Q 651 629 658 615 Q 669 600 667 584 Q 666 575 659 569 L 646 562 Q 632 557 622 559 Q 619 558 619 554 L 609 536 C 596 496 585 458 568 424 L 556 405 L 552 395 Q 549 391 551 388 Q 563 384 566 367 Q 571 355 569 345 Q 573 334 568 325 Q 568 312 562 300 Q 560 285 552 276 Q 546 269 543 263 Q 548 257 548 250 Q 552 245 549 238 Q 552 231 548 224 Q 547 218 542 212 L 543 206 L 537 190 L 532 180 L 524 170 L 514 160 L 502 150 L 490 145 L 487 130 Q 485 120 479 111 Q 469 103 457 100 Q 434 94 413 98 Q 400 100 390 107 Z`;
// Follow the robe inward below the hand; the open gap must reveal the extended landscape.
// The crook changes width down its length; a centreline stroke clips its edges.
const staff = 'M 480 1117 L 496 1060 L 610 647 L 646 551 L 675 450 L 703 349 L 725 278 C 731 254 735 233 742 218 C 748 204 756 195 768 195 C 781 195 788 205 790 219 C 793 236 786 255 776 263 C 770 267 761 266 758 259 C 757 252 762 247 768 247 C 774 237 777 224 773 215 C 771 208 766 207 761 211 C 751 220 746 239 743 254 L 720 350 L 692 452 L 663 553 L 632 652 L 500 1117 Q 496 1128 486 1127 Q 478 1126 480 1117 Z';
// Only the visible painted arc, never a broad ring of the old sky.
const halo = 'M 357 110 C 369 79 400 64 433 64 C 474 62 507 92 515 132 L 517 147';

export function Artwork({ motion, original, depth, focus, cloudSpeed, neuromancer, signalMotion }: {motion:boolean;original:boolean;depth:number;focus:boolean;cloudSpeed:number;neuromancer:boolean;signalMotion:boolean}) {
  const root = useRef<HTMLDivElement>(null);
  const environment = useRef<HTMLImageElement>(null);
  const target = useRef({x:0,y:0,last:0,active:false});
  const speed = useRef(cloudSpeed);
  const [meshReady,setMeshReady]=useState(false);
  useEffect(()=>{speed.current=cloudSpeed;},[cloudSpeed]);
  useEffect(() => {
    const el=root.current;
    if(!el)return;
    let raf=0, last=0, time=0, cloudTime=0, x=0, y=0;
    const set=(nx:number,ny:number)=>{el.style.setProperty('--px',nx.toFixed(4));el.style.setProperty('--py',ny.toFixed(4));};
    const clouds=(t:number)=>{
      // Eight minutes at 1×. Integrating speed keeps slider changes continuous.
      el.style.setProperty('--cloud-x',`${(Math.sin(t*Math.PI/240)*6).toFixed(4)}px`);
      el.style.setProperty('--cloud-y',`${(Math.sin(t*Math.PI/300)*1.2).toFixed(4)}px`);
    };
    if (!motion || original) {set(0,0);clouds(0);return;}
    function animate(now:number){
      const dt=last?Math.min((now-last)/1000,.06):0;last=now;time+=dt;cloudTime+=dt*speed.current;
      const idle=!target.current.active && now-target.current.last>1800;
      const tx=idle?Math.sin(time*.19)*.23:target.current.x;
      const ty=idle?Math.cos(time*.14)*.14:target.current.y;
      const lerp=1-Math.exp(-dt*4);
      x+=(tx-x)*lerp;y+=(ty-y)*lerp;set(x*depth/100,y*depth/100);
      clouds(cloudTime);
      raf=requestAnimationFrame(animate);
    }
    const start=()=>{last=0;cancelAnimationFrame(raf);if(!document.hidden)raf=requestAnimationFrame(animate);};
    const visibility=()=>{cancelAnimationFrame(raf);if(!document.hidden)start();};
    start();document.addEventListener('visibilitychange',visibility);
    return()=>{cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',visibility);set(0,0);clouds(0);};
  },[motion,original,depth]);
  function point(e:React.PointerEvent<HTMLDivElement>){
    if(!motion||original)return;
    if(e.pointerType==='touch'&&!target.current.active)return;
    const r=e.currentTarget.getBoundingClientRect();
    target.current.x=Math.max(-1,Math.min(1,(e.clientX-r.left)/r.width*2-1));
    target.current.y=Math.max(-1,Math.min(1,(e.clientY-r.top)/r.height*2-1));
    target.current.last=performance.now();
  }
  return <div ref={root} className={`art-interaction ${original?'is-original':''} ${focus&&!original?'has-focus':''} ${neuromancer&&!original?'is-neuromancer':''} ${signalMotion?'has-signal-motion':''}`} tabIndex={0} role="region" aria-label="The Good Shepherd interactive artwork. Move your pointer, drag with a finger, or use the arrow keys to explore depth."
    onPointerDown={e=>{if(!motion||original)return;target.current.active=true;e.currentTarget.setPointerCapture(e.pointerId);point(e);}}
    onPointerMove={point} onPointerUp={e=>{target.current.active=false;target.current.last=performance.now();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
    onPointerCancel={()=>{target.current.active=false;target.current.last=performance.now();}}
    onPointerLeave={()=>{target.current.active=false;target.current.last=performance.now();}}
    onKeyDown={e=>{const directions:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};const dir=directions[e.key];if(dir&&motion&&!original){e.preventDefault();target.current={x:dir[0],y:dir[1],last:performance.now(),active:false};}}}>
    <div className="landscape-space" aria-hidden="true">
      <img className="cloud-sky" src="/art/cloud-sky.png" alt="" draggable="false"/>
      <img ref={environment} className="landscape-image landscape-foreground" src="/art/landscape-wide.png" alt="" draggable="false"/>
    </div>
    <div className="near-landscape" aria-hidden="true"/>
    <figure className="art-frame">
      <div className={`scene-window ${meshReady?'mesh-ready':''}`}>
        <div className="halo-aureole" aria-hidden="true" />
        {neuromancer&&!original&&<div className="projection-pool" aria-hidden="true"/>}
        <img className="painting original-painting" src="/art/le-bon-pasteur.png" alt="Le Bon Pasteur: Christ wears a blue mantle and pink tunic, carries a sheep across his shoulders, and holds a staff in a wooded landscape." width="798" height="1260" fetchPriority="high" draggable="false" />
        <svg className="depth-scene" viewBox="0 0 798 1260" aria-hidden="true" focusable="false">
          <defs>
            <image id="original-art" href="/art/le-bon-pasteur.png" width="798" height="1260" preserveAspectRatio="none"/>
            <g id="subject-shape"><path d={figure}/></g>
            <filter id="soft-mask" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="0.65"/></filter>
            <mask id="subject-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="798" height="1260" style={{maskType:'luminance'}}><use href="#subject-shape" fill="white" color="white" filter="url(#soft-mask)"/></mask>
            <mask id="staff-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="798" height="1260" style={{maskType:'luminance'}}><path d={staff} fill="white"/></mask>
            <mask id="halo-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="798" height="1260" style={{maskType:'luminance'}}><path d={halo} fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round"/></mask>
            <radialGradient id="contact-shade"><stop stopColor="#171a12" stopOpacity=".62"/><stop offset=".45" stopColor="#252519" stopOpacity=".36"/><stop offset="1" stopColor="#302d1b" stopOpacity="0"/></radialGradient>
            <linearGradient id="cast-shade" x1="270" y1="1160" x2="682" y2="1250" gradientUnits="userSpaceOnUse"><stop stopColor="#25271a" stopOpacity=".32"/><stop offset=".6" stopColor="#2b2b1b" stopOpacity=".19"/><stop offset="1" stopColor="#34301e" stopOpacity="0"/></linearGradient>
            <filter id="sole-softness" x="-15%" y="-40%" width="130%" height="180%"><feGaussianBlur stdDeviation="1.8"/></filter>
            <filter id="ground-softness" x="-20%" y="-70%" width="150%" height="240%"><feGaussianBlur stdDeviation="8 4"/></filter>

          </defs>
          {/* The painted figure is lit from above-left. Its cast shadow falls
              rightward across the ground; contact shade stays fixed to each sole. */}
          <g className="ground-shadow">
            <path d="M 199 1154 Q 230 1143 274 1149 Q 390 1166 510 1183 Q 615 1191 708 1239 Q 744 1272 646 1269 Q 545 1259 460 1222 Q 419 1207 386 1197 Q 286 1180 199 1154 Z" fill="url(#cast-shade)" filter="url(#ground-softness)"/>
            <ellipse cx="238" cy="1158" rx="70" ry="15" fill="url(#contact-shade)" transform="rotate(-13 238 1158)"/>
            <ellipse cx="449" cy="1216" rx="65" ry="17" fill="url(#contact-shade)" transform="rotate(16 449 1216)"/>
            {/* Narrow occlusion at the actual sole contours, inside the wider penumbra. */}
            <g fill="#202018" fillOpacity=".55" filter="url(#sole-softness)">
              <path d="M 186 1151 Q 198 1159 220 1160 Q 248 1162 266 1145 L 283 1123 L 288 1130 Q 273 1153 248 1165 Q 220 1171 191 1160 Z"/>
              <path d="M 396 1168 Q 403 1187 424 1199 L 453 1217 Q 478 1228 496 1212 L 501 1219 Q 478 1237 447 1227 L 417 1209 Q 396 1195 391 1176 Z"/>
            </g>
          </g>
          <g className="subject-plane">
            <use href="#original-art" mask="url(#halo-mask)" className="halo-detail"/>
            <use href="#original-art" mask="url(#staff-mask)"/>
            <use href="#original-art" mask="url(#subject-mask)" className="figure-detail"/>
          </g>
        </svg>
        <FigureMesh environmentRef={environment} shape={figure} motion={motion&&!original} onReady={setMeshReady} neuromancer={neuromancer&&!original} signalMotion={signalMotion}/>
      </div>
      <figcaption className="sr-only">Le Bon Pasteur, Musée national de Port-Royal des Champs. The original painted figure appears over an extended landscape.</figcaption>
    </figure>
    {neuromancer&&!original&&<div className="signal-atmosphere" aria-hidden="true">
      <div className="signal-tint"/>
      <div className="signal-lines"/>
      <div className="signal-sweep"/>
      <svg className="signal-noise" width="100%" height="100%" focusable="false">
        <defs><filter id="signal-grain"><feTurbulence type="fractalNoise" baseFrequency=".82" numOctaves="1" seed="17"/><feColorMatrix type="saturate" values="0"/></filter></defs>
        <rect width="100%" height="100%" filter="url(#signal-grain)"/>
      </svg>
      <div className="signal-vignette"/>
    </div>}
  </div>;
}
