// Prompt Forge — writes ready-to-paste Stable Diffusion recipes for Local Dream,
// the open-source app that generates images offline on the phone (unlimited, free).
// NEXORA AI writes the recipe on the server (action "prompt"); without sign-in or
// internet a built-in recipe is used. Recipes save to the Vault as #prompt notes.
import { useRef, useState } from 'react';
import { WandSparkles, Copy, Check, BookmarkPlus, ExternalLink, RefreshCw, Smartphone } from 'lucide-react';
import { useStore, newNote, toast, db, tagsOf } from '../lib/store';
import { go } from '../lib/nav';
import { AI, Cloud, SB_URL, AIError } from '../lib/cloud';
import { Page, Section, Spinner } from '../components/ui';
import ForgeCore, { type ForgeCoreHandle } from '../components/ForgeCore';

const STYLES = [
  { id: 'photo', label: 'Photoreal', tags: 'photorealistic, natural light, 50mm photo, sharp focus, highly detailed' },
  { id: 'cine', label: 'Cinematic', tags: 'cinematic still, dramatic lighting, film grain, color graded, wide shot' },
  { id: 'anime', label: 'Anime', tags: 'anime style, clean lineart, vibrant colors, detailed background' },
  { id: 'illus', label: 'Illustration', tags: 'digital illustration, bold shapes, flat colors, poster art' },
  { id: 'product', label: 'Product', tags: 'product photography, studio softbox lighting, clean background, commercial' },
  { id: 'water', label: 'Watercolor', tags: 'watercolor painting, soft edges, paper texture, pastel colors' },
];
const ENGINES = [
  { id: 'sd15-npu', label: 'SD1.5 · NPU', model: 'SD1.5', size: 512, hint: 'Fast on Snapdragon (Redmi Note 13 Pro 5G)' },
  { id: 'sd15-cpu', label: 'SD1.5 · CPU', model: 'SD1.5', size: 512, hint: 'Works on any phone, slower' },
  { id: 'sdxl-npu', label: 'SDXL · NPU', model: 'SDXL', size: 1024, hint: 'Snapdragon 8 Gen 3 or newer only' },
];
const NEG = 'lowres, blurry, bad anatomy, extra fingers, deformed hands, watermark, text, signature, jpeg artifacts, worst quality';
const LOCAL_DREAM = 'https://github.com/xororz/local-dream/releases';

export interface Recipe { prompt: string; negative: string; steps: number; cfg: number; size: number; model: string; note: string; idea: string; style: string }

const pref = (() => { try { return JSON.parse(localStorage.getItem('nx.forge') || '{}'); } catch { return {}; } })();
const remember = (o: Record<string, string>) => { try { localStorage.setItem('nx.forge', JSON.stringify({ ...pref, ...o })); Object.assign(pref, o); } catch { /* private mode */ } };

function builtIn(idea: string, styleId: string, engineId: string): Recipe {
  const s = STYLES.find((x) => x.id === styleId)!; const e = ENGINES.find((x) => x.id === engineId)!;
  return {
    prompt: `${idea.replace(/\s+/g, ' ').trim()}, ${s.tags}, masterpiece, best quality`, negative: NEG,
    steps: e.model === 'SDXL' ? 25 : 20, cfg: 7, size: e.size, model: e.model, idea, style: s.label,
    note: 'Built-in recipe. Write the idea in English for best results, or sign in for an AI-written one.',
  };
}

function toMarkdown(r: Recipe) {
  return `**Idea:** ${r.idea}\n\n**Prompt**\n\n${r.prompt}\n\n**Negative prompt**\n\n${r.negative}\n\n**Settings:** ${r.model} · ${r.size}×${r.size} · ${r.steps} steps · CFG ${r.cfg} · ${r.style}\n\n${r.note ? `> ${r.note}\n\n` : ''}#prompt #localdream`;
}
function fromNote(body: string): Recipe | null {
  const get = (h: string) => body.match(new RegExp(`\\*\\*${h}\\*\\*\\n\\n([\\s\\S]*?)\\n\\n`))?.[1]?.trim();
  const prompt = get('Prompt'); if (!prompt) return null;
  const set = body.match(/\*\*Settings:\*\* (\S+) · (\d+)×\d+ · (\d+) steps · CFG ([\d.]+) · (.+)/);
  return {
    prompt, negative: get('Negative prompt') || NEG, idea: body.match(/\*\*Idea:\*\* (.+)/)?.[1] ?? '',
    model: set?.[1] ?? 'SD1.5', size: Number(set?.[2] ?? 512), steps: Number(set?.[3] ?? 20), cfg: Number(set?.[4] ?? 7), style: set?.[5] ?? '',
    note: body.match(/^> (.+)$/m)?.[1] ?? '',
  };
}

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ } ta.remove(); return ok;
  }
}

export default function Forge() {
  useStore();
  const [idea, setIdea] = useState<string>(pref.idea ?? '');
  const [style, setStyle] = useState<string>(pref.style ?? 'photo');
  const [engine, setEngine] = useState<string>(pref.engine ?? 'sd15-npu');
  const [busy, setBusy] = useState(false);
  const [recipe, setRecipe] = useState<Recipe>(() => builtIn('Blue doors of Sidi Bou Said at sunrise, bougainvillea, sea in the distance', 'photo', pref.engine ?? 'sd15-npu'));
  const [fresh, setFresh] = useState(false);
  const [copied, setCopied] = useState('');
  const core = useRef<ForgeCoreHandle>();

  const saved = db.notes.filter((n) => n.para !== 'archive' && tagsOf(n).includes('prompt')).slice(0, 8);

  async function forge() {
    const text = idea.trim();
    if (!text) { toast('Describe your image first'); return; }
    remember({ idea: text, style, engine });
    setBusy(true); core.current?.heat(true);
    const s = STYLES.find((x) => x.id === style)!; const e = ENGINES.find((x) => x.id === engine)!;
    try {
      if (!AI.ready()) throw { code: 'auth' };
      const res = await fetch(`${SB_URL}/functions/v1/nexora-forge`, { method: 'POST', headers: await Cloud.headers({ 'content-type': 'application/json' }), body: JSON.stringify({ idea: text, style: `${s.label} (${s.tags})`, model: e.model }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new AIError(j.error || `AI error ${res.status}`, j.code);
      const x = j.recipe as Omit<Recipe, 'idea' | 'style' | 'size' | 'model'>;
      if (!x?.prompt) throw { code: 'bad' };
      setRecipe({ prompt: x.prompt, negative: x.negative || NEG, steps: Math.round(Number(x.steps)) || 20, cfg: Number(x.cfg) || 7, note: x.note || '', size: e.size, model: e.model, idea: text, style: s.label });
    } catch (err) {
      setRecipe(builtIn(text, style, engine));
      const c = (err as AIError)?.code;
      if (c === 'limit' || c === 'provider_busy') toast((err as AIError).message);
      else if (c && c !== 'auth' && c !== 'offline') toast('AI unavailable, used the built-in recipe');
    } finally {
      setBusy(false); setFresh(true); core.current?.heat(false); core.current?.burst();
    }
  }

  async function doCopy(key: string, text: string) {
    if (await copy(text)) { setCopied(key); setTimeout(() => setCopied(''), 1500); } else toast('Copy failed. Long-press the text to copy it.');
  }
  function saveToVault() {
    const n = newNote({ title: `Prompt: ${recipe.idea.slice(0, 60) || recipe.prompt.slice(0, 60)}`, body: toMarkdown(recipe), type: 'idea', para: 'resources' });
    toast('Saved to Vault', 'Open', () => go({ name: 'note', id: n.id }));
  }

  const all = `${recipe.prompt}\n\nNegative prompt: ${recipe.negative}\n\n${recipe.model} · ${recipe.size}×${recipe.size} · Steps ${recipe.steps} · CFG ${recipe.cfg}`;

  return (
    <Page title="Prompt Forge" sub="Unlimited images, made offline on your phone">
      <div className="card overflow-hidden">
        <ForgeCore onReady={(h) => (core.current = h)} />
        <div className="p-4 pt-0 space-y-4">
          <label className="label block" htmlFor="forge-idea">Your idea · any language</label>
          <textarea id="forge-idea" className="input h-auto min-h-[96px] py-3 resize-y leading-relaxed" maxLength={600}
            placeholder="ร้านข้าวแกงริมถนนตอนเช้า, solar panels on a Thai house, a fox in a café…" value={idea} onChange={(e) => setIdea(e.target.value)} />
          <div>
            <div className="label mb-2">Style</div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1" role="radiogroup" aria-label="Style">
              {STYLES.map((s) => <button key={s.id} type="button" role="radio" aria-checked={style === s.id} className={`chip ${style === s.id ? 'chip-on' : ''}`} onClick={() => setStyle(s.id)}>{s.label}</button>)}
            </div>
          </div>
          <div>
            <div className="label mb-2 flex items-center gap-1.5"><Smartphone size={13} /> Local Dream model</div>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Model">
              {ENGINES.map((e) => (
                <button key={e.id} type="button" role="radio" aria-checked={engine === e.id} onClick={() => { setEngine(e.id); remember({ engine: e.id }); }}
                  className={`rounded-xl px-2 py-2 text-[13px] font-semibold border transition ${engine === e.id ? 'border-primary bg-primary/10 text-ink' : 'hair text-muted'}`}>{e.label}</button>
              ))}
            </div>
            <p className="text-[12px] text-muted mt-1.5">{ENGINES.find((e) => e.id === engine)!.hint}</p>
          </div>
          <button className="btn-primary w-full h-12 text-[16px]" onClick={forge} disabled={busy}>
            {busy ? <><Spinner /> Forging…</> : <><WandSparkles size={18} /> Forge prompt</>}
          </button>
        </div>
      </div>

      <Section title="Recipe" action={<span className={`pill ${fresh ? 'bg-primary/15 text-primary' : 'bg-raised text-muted'}`}>{fresh ? 'Ready' : 'Example'}</span>}>
        <div className="card p-4 space-y-4">
          <CopyBlock label="Prompt" text={recipe.prompt} done={copied === 'p'} onCopy={() => doCopy('p', recipe.prompt)} />
          <CopyBlock label="Negative prompt" text={recipe.negative} done={copied === 'n'} onCopy={() => doCopy('n', recipe.negative)} />
          <div className="grid grid-cols-4 gap-2 text-center">
            {[[`${recipe.size}²`, 'Size'], [recipe.steps, 'Steps'], [recipe.cfg, 'CFG'], [recipe.model, 'Model']].map(([v, l]) => (
              <div key={String(l)} className="rounded-xl bg-raised py-2"><div className="text-[16px] font-semibold tabular-nums">{v}</div><div className="text-[10px] uppercase tracking-wider text-muted">{l}</div></div>
            ))}
          </div>
          {recipe.note && <p className="text-[13px] text-muted leading-relaxed">{recipe.note}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-soft" onClick={() => doCopy('a', all)}>{copied === 'a' ? <Check size={17} /> : <Copy size={17} />} Copy all</button>
            <button className="btn-soft" onClick={saveToVault}><BookmarkPlus size={17} /> Save</button>
          </div>
          {fresh && <button className="btn-ghost w-full" onClick={forge} disabled={busy}><RefreshCw size={16} /> Another version</button>}
        </div>
      </Section>

      <Section title="Make it in Local Dream">
        <div className="card p-4">
          <ol className="space-y-2.5 text-[14px]">
            {['Copy all, then open Local Dream.', `Pick the ${ENGINES.find((e) => e.id === engine)!.label} model, paste the prompt and the negative prompt.`, 'Set the size, steps and CFG above and generate. It runs offline, so make as many as you like.'].map((t, i) => (
              <li key={i} className="flex gap-3"><span className="w-6 h-6 shrink-0 rounded-full grad text-white text-[12px] font-semibold flex items-center justify-center">{i + 1}</span><span className="pt-0.5">{t}</span></li>
            ))}
          </ol>
          <a href={LOCAL_DREAM} target="_blank" rel="noreferrer" className="btn-ghost btn-sm mt-3 -ml-2"><ExternalLink size={15} /> Get Local Dream (free, open source)</a>
        </div>
      </Section>

      {saved.length > 0 && (
        <Section title="Saved recipes" action={<button className="text-[13px] text-primary font-medium" onClick={() => go({ name: 'vault', tag: 'prompt' })}>See all</button>}>
          <div className="card divide-y hair">
            {saved.map((n) => (
              <button key={n.id} className="w-full px-4 py-3 text-left hover:bg-raised/50" onClick={() => { const r = fromNote(n.body); if (r) { setRecipe(r); setFresh(true); scrollTo({ top: 0, behavior: 'smooth' }); } else go({ name: 'note', id: n.id }); }}>
                <div className="font-medium text-[15px] truncate">{n.title.replace(/^Prompt:\s*/, '')}</div>
                <div className="text-[12px] text-muted truncate">{fromNote(n.body)?.prompt ?? ''}</div>
              </button>
            ))}
          </div>
        </Section>
      )}
    </Page>
  );
}

function CopyBlock({ label, text, done, onCopy }: { label: string; text: string; done: boolean; onCopy: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5"><span className="label">{label}</span>
        <button className={`btn-sm inline-flex items-center gap-1 rounded-lg px-2.5 h-8 text-[12px] font-semibold ${done ? 'text-ok bg-ok/10' : 'text-muted bg-raised'}`} onClick={onCopy}>{done ? <Check size={14} /> : <Copy size={14} />}{done ? 'Copied' : 'Copy'}</button>
      </div>
      <p className="rounded-xl bg-raised px-3 py-2.5 text-[14px] leading-relaxed select-text" style={{ overflowWrap: 'anywhere' }}>{text}</p>
    </div>
  );
}
