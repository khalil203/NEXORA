import { ImageOff, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { assetUrl } from '../lib/db';
import type { Project } from '../lib/types';

export function AssetImg({ id, className, alt = '' }: { id?: string; className?: string; alt?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (id) assetUrl(id).then((u) => alive && setUrl(u));
    return () => { alive = false; };
  }, [id]);
  if (!url) return <div className={`${className} bg-ink-700 grid place-items-center text-white/25`}><ImageOff size={22} /></div>;
  return <img src={url} alt={alt} className={`${className} object-cover`} draggable={false} />;
}

export function ProjectThumb({ p, className = '' }: { p: Project; className?: string }) {
  const bg = p.scenes[0]?.background.colors ?? ['#5aa8f5', '#8b7cf6'];
  return (
    <div className={`relative overflow-hidden rounded-[22px] border border-white/10 ${className}`} style={{ background: `linear-gradient(160deg, ${bg[0]}, ${bg[1]})` }}>
      {p.images[0] && <AssetImg id={p.images[0]} className="absolute inset-[14%] w-[72%] h-[72%] rounded-2xl shadow-card" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full glass grid place-items-center">
        <Play size={18} className="ml-0.5" fill="currentColor" />
      </span>
      <span className="absolute top-2 left-2 rounded-full bg-black/45 px-2 py-0.5 text-[11px]">{p.aspect} · {p.duration}s</span>
    </div>
  );
}
