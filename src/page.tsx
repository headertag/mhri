'use client';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Check } from 'lucide-react';
import { Checkbox } from '@base-ui/react/checkbox';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Artwork } from './artwork';
import { toRomanYear } from './roman-year';

function Copyright() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  useEffect(() => {
    const updateYear = () => setYear(new Date().getFullYear());
    updateYear();
    const interval = window.setInterval(updateYear, 60_000);
    document.addEventListener('visibilitychange', updateYear);
    window.addEventListener('focus', updateYear);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', updateYear);
      window.removeEventListener('focus', updateYear);
    };
  }, []);
  return <p className="copyright">© <span suppressHydrationWarning>{toRomanYear(year)}</span> Magnifica Humanitas Redemptoris Iesu. All rights reserved.</p>;
}

export default function Home() {
  const [motion,setMotion]=useState(false);
  const [original,setOriginal]=useState(false);
  const [depth,setDepth]=useState(75);
  const [cloudSpeed,setCloudSpeed]=useState(1.5);
  const [focus,setFocus]=useState(true);
  // An opt-in interpretation: every new visit starts with the painting.
  const [neuromancer,setNeuromancer]=useState(false);
  const [reduced,setReduced]=useState(false);
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    const mq=matchMedia('(prefers-reduced-motion: reduce)');
    let saved:{motion?:boolean;depth?:number;focus?:boolean;cloudSpeed?:number}={};
    try{saved=JSON.parse(localStorage.getItem('mhri-view')||'{}')||{};}catch{}
    setReduced(mq.matches);setMotion(!mq.matches&&saved.motion!==false);
    if(typeof saved.depth==='number')setDepth(Math.max(0,Math.min(100,saved.depth)));
    if(typeof saved.focus==='boolean')setFocus(saved.focus);
    if(typeof saved.cloudSpeed==='number'&&Number.isFinite(saved.cloudSpeed))setCloudSpeed(Math.max(0,Math.min(4,saved.cloudSpeed)));
    setReady(true);
    const preference=()=>{setReduced(mq.matches);if(mq.matches)setMotion(false);};
    mq.addEventListener('change',preference);
    return()=>mq.removeEventListener('change',preference);
  },[]);
  useEffect(()=>{if(ready)try{localStorage.setItem('mhri-view',JSON.stringify({motion,depth,focus,cloudSpeed}));}catch{}},[motion,depth,focus,cloudSpeed,ready]);
  return <main className="sanctuary">
    <h1 className="sr-only">MHRI — Magnifica Humanitas Redemptoris Iesu</h1>
    <svg className="wordmark-effects" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <filter id="mhri-gold-finish" x="-40%" y="-60%" width="180%" height="220%" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feMorphology in="SourceAlpha" operator="dilate" radius="1" result="letter-edge"/>
          <feFlood floodColor="#493e2c" result="bronze"/>
          <feComposite in="bronze" in2="letter-edge" operator="in" result="border"/>
          <feOffset in="SourceAlpha" dx=".6" dy=".6" result="inset-edge"/>
          <feComposite in="SourceAlpha" in2="inset-edge" operator="out" result="light-edge"/>
          <feFlood floodColor="#c5ab7c" floodOpacity=".65" result="edge-gold"/>
          <feComposite in="edge-gold" in2="light-edge" operator="in" result="bevel"/>
          <feMerge result="outlined"><feMergeNode in="border"/><feMergeNode in="SourceGraphic"/><feMergeNode in="bevel"/></feMerge>
          <feDropShadow in="outlined" dx=".6" dy="1" stdDeviation=".4" floodColor="#28251f" floodOpacity=".6" result="relief"/>
          <feDropShadow in="relief" dx="0" dy="0" stdDeviation="2.5" floodColor="#333333" floodOpacity=".4"/>
        </filter>
      </defs>
    </svg>
    <Artwork motion={motion} original={original} depth={depth} focus={focus} cloudSpeed={cloudSpeed} neuromancer={neuromancer} signalMotion={motion&&!reduced}/>
    <header className="masthead"><a className="wordmark" href="/" aria-label="MHRI — Magnifica Humanitas Redemptoris Iesu"><span>MHRI</span></a></header>
    <footer className="viewer-footer">
      <Copyright />
      <Dialog><DialogTrigger className="about-button">About the painting</DialogTrigger><DialogContent className="view-dialog">
        <DialogTitle className="dialog-title" lang="fr">Le Bon Pasteur</DialogTitle><DialogDescription className="dialog-description">The Good Shepherd · Seventeenth century</DialogDescription>
        <p>Christ carries a sheep across his shoulders, an image of care, protection, and the recovery of the lost.</p>
        <p>The painting is held at the Musée national de Port-Royal des Champs. Often reproduced under Philippe de Champaigne’s name, the museum currently lists Jean-Baptiste de Champaigne and discusses the attribution.</p>
        <a className="source-link" href="https://port-royal-des-champs.fr/le-bon-pasteur/" target="_blank" rel="noreferrer">Explore the museum record <ArrowUpRight size={16}/></a>
        <div className="setting-row"><label htmlFor="motion-switch">Motion</label><Switch id="motion-switch" checked={motion} onCheckedChange={setMotion}/></div>
        {reduced&&<p className="preference-note">Movement starts off to respect your device’s reduced-motion preference.</p>}
        <div className="depth-setting"><div className="setting-label"><label id="depth-label">Depth</label><output>{depth}%</output></div><Slider aria-labelledby="depth-label" value={[depth]} min={0} max={100} step={5} onValueChange={v=>setDepth(Array.isArray(v)?v[0]:v)}/></div>
        <div className="depth-setting"><div className="setting-label"><label id="cloud-speed-label">Cloud speed</label><output>{cloudSpeed===0?'Still':`${cloudSpeed}×`}</output></div><Slider aria-labelledby="cloud-speed-label" value={[cloudSpeed]} min={0} max={4} step={.25} onValueChange={v=>setCloudSpeed(Array.isArray(v)?v[0]:v)}/></div>
        <div className="setting-row"><label htmlFor="focus-switch">Atmospheric focus</label><Switch id="focus-switch" checked={focus} onCheckedChange={setFocus}/></div>
        <div className="setting-row"><label htmlFor="original-switch">Show original painting</label><Switch id="original-switch" checked={original} onCheckedChange={value=>{setOriginal(value);if(value)setNeuromancer(false);}}/></div>
        <div className="setting-row neuromancer-setting">
          <label htmlFor="neuromancer-checkbox">Neuromancer mode</label>
          <Checkbox.Root id="neuromancer-checkbox" className="mode-checkbox" checked={neuromancer} onCheckedChange={value=>{setNeuromancer(value);if(value)setOriginal(false);}}>
            <Checkbox.Indicator className="mode-check"><Check size={15} aria-hidden="true"/></Checkbox.Indicator>
          </Checkbox.Root>
        </div>
        <div className="art-credit">Public-domain artwork. Supplied reproduction.<br/>The painted figure is preserved. The landscape is extended for this immersive presentation.</div>
      </DialogContent></Dialog>
    </footer>
  </main>;
}
