// Studio — AI images and videos in the cloud via Muapi (the engine behind Open Generative AI).
// The nexora-studio edge function holds the Muapi key; this screen only sends the prompt
// and polls the job. Results can be downloaded or saved to the Vault as #studio notes.
import { useEffect, useRef, useState } from 'react';
import { Clapperboard, Image as ImageI, Film, Download, BookmarkPlus, RefreshCw, LogIn } from 'lucide-react';
import { useStore, newNote, toast, db, tagsOf } from '../lib/store';
import { go } from '../lib/nav';
import { AI, Cloud, SB_URL } from '../lib/cloud';
import { Page, Section, Spinner } from '../components/ui';

// Keep in sync with MODELS in supabase/functions/nexora-studio/index.ts
const MODELS = [
  { id: 'bytedance-seedream-image', label: 'Seedream', kind: 'image', hint: 'Sharp, realistic photos and ads' },
  { id: 'gpt-image-2-text-to-image', label: 'GPT Image 2', kind: 'image', hint: 'Best with text and Thai signs in the picture' },
  { id: 'flux-3-text-to-image', label: 'Flux 3', kind: 'image', hint: 'Artistic, cinematic looks' },
  { id: 'happy-horse-1.1-text-to-video-720p', label: 'Happy Horse 720p', kind: 'video', hint: 'Short clips, quick' },
  { id: 'grok-imagine-video-1-5-text-to-video', label: 'Grok Imagine', kind: 'video', hint: 'Lively motion, with sound' },
  { id: 'flux-3-text-to-video', label: 'Flux 3 Video', kind: 'video', hint: 'Cinematic clips' },
] as const;
type Kind = 'image' | 'video';
const RATIOS = [['9:16', 'TikTok / Reels'], ['1:1', 'Square'], ['4:5', 'Facebook'], ['16:9', 'YouTube']] as const;

const pref = (() => { try { return JSON.parse(localStorage.getItem('nx.studio') || '{}'); } catch { return {}; } })();
const remember = (o: Record<string, string>) => { try { Object.assign(pref, o); localStorage.setItem('nx.studio', JSON.stringify(pref)); } catch { /* private mode */ } };

async function call(body: object) {
  const res = await fetch(`${SB_URL}/functions/v1/nexora-studio`, { method: 'POST', headers: await Cloud.headers({ 'content-type': 'application/json' }), body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Studio error ${res.status}`);
  return j;
}

export default function Studio() {
  useStore();
  const [kind, setKind] = useState<Kind>(pref.kind === 'video' ? 'video' : 'image');
  const [model, setModel] = useState<string>(MODELS.some((m) => m.id === pref.model) ? pref.model : MODELS[0].id);
  const [ratio, setRatio] = useState<string>(pref.ratio || '9:16');
  const [prompt, setPrompt] = useState<string>(pref.prompt || '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<{ url: string; kind: Kind; prompt: string } | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const list = MODELS.filter((m) => m.kind === kind);
  const m = MODELS.find((x) => x.id === model && x.kind === kind) ?? list[0];
  const saved = db.notes.filter((n) => n.para !== 'archive' && tagsOf(n).includes('studio')).slice(0, 8);

  function pickKind(k: Kind) { setKind(k); const first = MODELS.find((x) => x.kind === k)!.id; setModel(first); remember({ kind: k, model: first }); }

  async function generate() {
    const text = prompt.trim();
    if (!text) { toast('Describe what to make first'); return; }
    if (!AI.ready()) { toast(Cloud.on() ? 'You are offline' : 'Sign in to use Studio'); return; }
    remember({ prompt: text, ratio, model: m.id, kind });
    setBusy(true); setResult(null); setStatus('Sending…');
    const start = Date.now();
    try {
      const { id } = await call({ action: 'submit', model: m.id, prompt: text, ratio });
      while (alive.current && Date.now() - start < 15 * 60e3) {
        await new Promise((r) => setTimeout(r, 3000));
        const s = await call({ action: 'status', id });
        if (s.status === 'done') { setResult({ url: s.url, kind, prompt: text }); setStatus(''); return; }
        if (s.status === 'failed') throw new Error(s.error || 'Generation failed');
        const sec = Math.round((Date.now() - start) / 1000);
        setStatus(`Making your ${kind}… ${sec}s${kind === 'video' && sec > 30 ? ' (videos take a few minutes)' : ''}`);
      }
      if (alive.current) throw new Error('This is taking too long. Try again later.');
    } catch (e) {
      setStatus(''); toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!result) return;
    try {
      const blob = await (await fetch(result.url)).blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `nexora-${Date.now()}.${result.kind === 'video' ? 'mp4' : 'png'}`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch { window.open(result.url, '_blank'); }
  }

  function saveToVault() {
    if (!result) return;
    const n = newNote({ title: `Studio: ${result.prompt.slice(0, 60)}`, body: `**Prompt:** ${result.prompt}\n\n**Model:** ${m.label} · ${ratio}\n\n${result.kind === 'video' ? `[Watch the video](${result.url})` : `![](${result.url})`}\n\n${result.url}\n\n#studio`, type: 'idea', para: 'resources' });
    toast('Saved to Vault', 'Open', () => go({ name: 'note', id: n.id }));
  }

  return (
    <Page title="Studio" sub="AI images and videos, made in the cloud">
      <div className="card p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Type">
          {([['image', 'Image', ImageI], ['video', 'Video', Film]] as const).map(([k, l, Icon]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => pickKind(k)}
              className={`h-11 rounded-xl text-[14px] font-semibold border transition flex items-center justify-center gap-2 ${kind === k ? 'border-primary bg-primary/10 text-ink' : 'hair text-muted'}`}><Icon size={17} />{l}</button>
          ))}
        </div>
        <div>
          <div className="label mb-2">Model</div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1" role="radiogroup" aria-label="Model">
            {list.map((x) => <button key={x.id} type="button" role="radio" aria-checked={m.id === x.id} className={`chip ${m.id === x.id ? 'chip-on' : ''}`} onClick={() => { setModel(x.id); remember({ model: x.id }); }}>{x.label}</button>)}
          </div>
          <p className="text-[12px] text-muted mt-1.5">{m.hint}</p>
        </div>
        <div>
          <label className="label block mb-2" htmlFor="studio-prompt">Describe it · English works best</label>
          <textarea id="studio-prompt" className="input h-auto min-h-[96px] py-3 resize-y leading-relaxed" maxLength={1500}
            placeholder={kind === 'video' ? 'A tailor fitting a navy suit in a Bangkok shop, slow camera push-in, warm light…' : 'Thai curry rice stall at sunrise, steam rising, 25 baht sign, photo…'}
            value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </div>
        <div>
          <div className="label mb-2">Size</div>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Size">
            {RATIOS.map(([r, l]) => (
              <button key={r} type="button" role="radio" aria-checked={ratio === r} onClick={() => { setRatio(r); remember({ ratio: r }); }}
                className={`rounded-xl px-1 py-2 border transition ${ratio === r ? 'border-primary bg-primary/10 text-ink' : 'hair text-muted'}`}>
                <div className="text-[14px] font-semibold">{r}</div><div className="text-[10px] truncate">{l}</div>
              </button>
            ))}
          </div>
        </div>
        {Cloud.on() ? (
          <button className="btn-primary w-full h-12 text-[16px]" onClick={generate} disabled={busy}>
            {busy ? <><Spinner /> Working…</> : <><Clapperboard size={18} /> Generate {kind}</>}
          </button>
        ) : (
          <button className="btn-primary w-full h-12 text-[16px]" onClick={() => go({ name: 'settings' })}><LogIn size={18} /> Sign in to use Studio</button>
        )}
        {status && <p className="text-[13px] text-muted text-center">{status}</p>}
        <p className="text-[11px] text-muted text-center">Each generation uses your Muapi credits.</p>
      </div>

      {result && (
        <Section title="Result">
          <div className="card p-3 space-y-3">
            {result.kind === 'video'
              ? <video src={result.url} controls playsInline autoPlay loop className="w-full rounded-xl bg-raised" />
              : <img src={result.url} alt={result.prompt} className="w-full rounded-xl bg-raised" />}
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-soft" onClick={download}><Download size={17} /> Download</button>
              <button className="btn-soft" onClick={saveToVault}><BookmarkPlus size={17} /> Save</button>
            </div>
            <button className="btn-ghost w-full" onClick={generate} disabled={busy}><RefreshCw size={16} /> Another version</button>
          </div>
        </Section>
      )}

      {saved.length > 0 && (
        <Section title="Saved" action={<button className="text-[13px] text-primary font-medium" onClick={() => go({ name: 'vault', tag: 'studio' })}>See all</button>}>
          <div className="card divide-y hair">
            {saved.map((n) => (
              <button key={n.id} className="w-full px-4 py-3 text-left hover:bg-raised/50" onClick={() => go({ name: 'note', id: n.id })}>
                <div className="font-medium text-[15px] truncate">{n.title.replace(/^Studio:\s*/, '')}</div>
              </button>
            ))}
          </div>
        </Section>
      )}
    </Page>
  );
}
