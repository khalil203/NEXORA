import { Plus, Brain, Sparkles, ShieldCheck } from 'lucide-react';
import { nx, save } from '../lib/store';
import { SignIn } from './Settings';

const POINTS = [
  { icon: Plus, title: 'Capture anything', text: 'Thoughts, tasks, voice, photos, files and links, in seconds.' },
  { icon: Brain, title: 'Ask your brain', text: 'Answers from your own notes, with the sources shown.' },
  { icon: Sparkles, title: 'Remember what matters', text: 'Goals, people and decisions, kept only with your OK.' },
];

/** First-open screen: shown until you sign in or choose to continue on this device. */
export default function Welcome() {
  const done = () => { nx.welcomed = true; save(); };
  return (
    <div className="dark fixed inset-0 z-[80] overflow-y-auto text-white anim-fade" style={{ background: 'radial-gradient(130% 70% at 50% 18%, #0a1650 0%, #030a2c 45%, #000211 100%)' }}>
      <div className="min-h-full flex"><div className="m-auto w-full max-w-5xl px-6 pt-[max(32px,env(safe-area-inset-top))] pb-10 flex flex-col lg:flex-row items-center gap-8 lg:gap-16">
        <div className="flex flex-col items-center lg:items-start text-center lg:text-left max-w-md">
          <img src="icons/nexora-logo-720.jpg" alt="NEXORA — Your Mind. Amplified." className="w-[min(48vw,200px)] lg:w-[280px] rounded-[28px] lg:rounded-[34px] anim-in" style={{ boxShadow: '0 30px 90px -20px rgba(100,139,255,.6)' }} />
          <h1 className="mt-6 lg:mt-8 text-[28px] lg:text-[38px] font-bold leading-tight tracking-tight">Your personal <span className="grad-text">AI second brain</span></h1>
          <p className="mt-3 text-[15px] text-[#A7B0C2] leading-relaxed">Everything connected. Nothing forgotten. Capture once, and NEXORA organizes it, links it and helps you act on it.</p>
          <ul className="mt-6 space-y-3 w-full text-left">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3 items-start">
                <span className="w-9 h-9 shrink-0 rounded-xl grad flex items-center justify-center shadow-glow"><p.icon size={18} /></span>
                <span><b className="block text-[15px]">{p.title}</b><span className="text-[13px] text-[#A7B0C2]">{p.text}</span></span>
              </li>
            ))}
          </ul>
        </div>

        <div className="w-full max-w-sm">
          <div className="rounded-[26px] p-6 border border-white/10" style={{ background: 'rgba(23,29,43,.72)', backdropFilter: 'blur(18px)' }}>
            <h2 className="text-[20px] font-bold">Sign in</h2>
            <p className="text-[13px] text-[#A7B0C2] mt-1 mb-4">Sync all your devices and switch on AI chat, memories and auto-organizing.</p>
            <SignIn plain onDone={done} />
          </div>
          <button onClick={done} className="mt-4 w-full h-12 rounded-2xl text-[15px] font-semibold text-[#c9d4ff] hover:bg-white/5">Continue on this device</button>
          <p className="mt-2 text-[12px] text-[#A7B0C2] text-center flex items-center justify-center gap-1.5"><ShieldCheck size={13} /> Your notes stay private to your account.</p>
        </div>
      </div></div>
    </div>
  );
}
