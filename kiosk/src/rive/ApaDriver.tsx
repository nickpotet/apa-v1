import type { Language } from '../voice/providers/VoiceProvider';
import type { KioskState } from '../types';

const RING: Record<KioskState, string> = {
  idle:      'ring-white/10 shadow-[0_0_70px_rgba(125,211,252,0.14)]',
  listening: 'ring-sky-400/70 shadow-[0_0_90px_rgba(56,189,248,0.30)]',
  thinking:  'ring-amber-400/70 shadow-[0_0_90px_rgba(251,191,36,0.24)]',
  speaking:  'ring-emerald-400/70 shadow-[0_0_90px_rgba(52,211,153,0.28)]',
  excited:   'ring-yellow-300/80 shadow-[0_0_100px_rgba(250,204,21,0.34)]',
  sleeping:  'ring-white/5 shadow-[0_0_50px_rgba(255,255,255,0.08)] opacity-70',
  error:     'ring-red-500/70 shadow-[0_0_85px_rgba(239,68,68,0.26)]',
  capped:    'ring-white/5 shadow-[0_0_50px_rgba(255,255,255,0.08)] opacity-75',
  offline:   'ring-red-500/40 shadow-[0_0_70px_rgba(239,68,68,0.18)] opacity-75',
};

const ACCENT: Record<Language, string> = {
  es: '#ef4444',
  en: '#38bdf8',
  ru: '#a78bfa',
  ca: '#facc15',
};

const EYE: Record<KioskState, { left: string; right: string }> = {
  idle:      { left: 'M93 118c0 5-3 9-8 9s-8-4-8-9 3-9 8-9 8 4 8 9Z', right: 'M151 118c0 5-3 9-8 9s-8-4-8-9 3-9 8-9 8 4 8 9Z' },
  listening: { left: 'M95 115c0 6-4 10-10 10s-10-4-10-10 4-10 10-10 10 4 10 10Z', right: 'M153 115c0 6-4 10-10 10s-10-4-10-10 4-10 10-10 10 4 10 10Z' },
  thinking:  { left: 'M95 111c-2 5-6 8-11 7s-8-5-7-10c2-5 6-8 11-7s8 5 7 10Z', right: 'M153 108c1 5-2 9-7 10s-10-2-11-7 2-9 7-10 10 2 11 7Z' },
  speaking:  { left: 'M94 116c0 5-4 9-9 9s-9-4-9-9 4-9 9-9 9 4 9 9Z', right: 'M152 116c0 5-4 9-9 9s-9-4-9-9 4-9 9-9 9 4 9 9Z' },
  excited:   { left: 'M85 104l6 9 10 1-8 6 3 10-9-5-9 5 2-10-8-6 10-1 3-9Z', right: 'M143 104l6 9 10 1-8 6 3 10-9-5-9 5 2-10-8-6 10-1 3-9Z' },
  sleeping:  { left: 'M76 118c7 6 14 6 21 0', right: 'M134 118c7 6 14 6 21 0' },
  error:     { left: 'M75 109l20 18M95 109l-20 18', right: 'M133 109l20 18M153 109l-20 18' },
  capped:    { left: 'M76 118c7 6 14 6 21 0', right: 'M134 118c7 6 14 6 21 0' },
  offline:   { left: 'M75 109l20 18M95 109l-20 18', right: 'M133 109l20 18M153 109l-20 18' },
};

interface Props {
  kioskState: KioskState;
  lang: Language;
}

function stateClass(kioskState: KioskState): string {
  if (kioskState === 'speaking') return 'apa--speaking';
  if (kioskState === 'listening') return 'apa--listening';
  if (kioskState === 'thinking') return 'apa--thinking';
  if (kioskState === 'excited') return 'apa--excited';
  if (kioskState === 'sleeping' || kioskState === 'capped') return 'apa--sleeping';
  if (kioskState === 'error' || kioskState === 'offline') return 'apa--error';
  return 'apa--idle';
}

export function ApaDriver({ kioskState, lang }: Props) {
  const accent = ACCENT[lang];
  const eye = EYE[kioskState];

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden">
      <div className="apa-ground-shadow absolute bottom-6 h-10 w-44 rounded-full bg-sky-300/10" />
      <div
        className={[
          'apa-stage relative flex aspect-square w-[min(76vw,28rem)] items-center justify-center rounded-full bg-white/[0.045] ring-2 transition-all duration-500',
          RING[kioskState],
          stateClass(kioskState),
        ].join(' ')}
      >
        <div className="apa-float relative h-[82%] w-[82%]">
          <svg viewBox="0 0 240 280" className="h-full w-full overflow-visible" role="img" aria-label="Apa">
            <defs>
              <radialGradient id="apaBelly" cx="50%" cy="42%" r="58%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="66%" stopColor="#edf7ff" />
                <stop offset="100%" stopColor="#cfe7f4" />
              </radialGradient>
              <linearGradient id="apaBody" x1="44" x2="198" y1="31" y2="248" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#263244" />
                <stop offset="58%" stopColor="#111827" />
                <stop offset="100%" stopColor="#07111f" />
              </linearGradient>
            </defs>

            <ellipse className="apa-shadow" cx="120" cy="251" rx="62" ry="13" fill="#020617" opacity="0.42" />

            <g className="apa-body">
              <path d="M53 147c0-70 29-116 67-116s67 46 67 116c0 69-28 111-67 111s-67-42-67-111Z" fill="url(#apaBody)" />
              <path d="M73 157c0-48 20-82 47-82s47 34 47 82c0 50-20 83-47 83s-47-33-47-83Z" fill="url(#apaBelly)" />
              <path d="M72 86c8-34 26-55 48-55s40 21 48 55c-12-13-29-21-48-21s-36 8-48 21Z" fill="#334155" opacity="0.78" />

              <g className="apa-flipper apa-flipper-left">
                <path d="M58 139c-28 15-43 41-39 69 26-5 46-25 58-61Z" fill="#111827" />
                <path d="M35 193c15-8 26-21 34-38" fill="none" stroke="#334155" strokeWidth="4" strokeLinecap="round" opacity="0.55" />
              </g>
              <g className="apa-flipper apa-flipper-right">
                <path d="M182 139c28 15 43 41 39 69-26-5-46-25-58-61Z" fill="#111827" />
                <path d="M205 193c-15-8-26-21-34-38" fill="none" stroke="#334155" strokeWidth="4" strokeLinecap="round" opacity="0.55" />
              </g>

              <path d="M82 90c7-17 22-27 38-27s31 10 38 27c-8 13-22 21-38 21s-30-8-38-21Z" fill="#f8fafc" opacity="0.94" />

              <g className="apa-eyes">
                {kioskState === 'sleeping' || kioskState === 'capped' ? (
                  <>
                    <path d={eye.left} fill="none" stroke="#0f172a" strokeWidth="5" strokeLinecap="round" />
                    <path d={eye.right} fill="none" stroke="#0f172a" strokeWidth="5" strokeLinecap="round" />
                  </>
                ) : kioskState === 'error' || kioskState === 'offline' ? (
                  <>
                    <path d={eye.left} fill="none" stroke="#0f172a" strokeWidth="5" strokeLinecap="round" />
                    <path d={eye.right} fill="none" stroke="#0f172a" strokeWidth="5" strokeLinecap="round" />
                  </>
                ) : (
                  <>
                    <path className="apa-eye" d={eye.left} fill="#0f172a" />
                    <path className="apa-eye" d={eye.right} fill="#0f172a" />
                    <circle className="apa-eye-glint" cx="88" cy="113" r="2.3" fill="#fff" opacity="0.9" />
                    <circle className="apa-eye-glint" cx="146" cy="113" r="2.3" fill="#fff" opacity="0.9" />
                  </>
                )}
              </g>

              <g className="apa-beak">
                <path d="M104 132c9-8 23-8 32 0l-16 12Z" fill="#f59e0b" />
                <path className="apa-beak-lower" d="M104 134c10 10 22 10 32 0l-16 15Z" fill="#fb923c" />
              </g>

              <g className="apa-scarf">
                <path d="M79 164c24 11 58 11 82 0" fill="none" stroke={accent} strokeWidth="13" strokeLinecap="round" />
                <path d="M145 168c10 12 13 25 10 39" fill="none" stroke={accent} strokeWidth="12" strokeLinecap="round" />
                <circle cx="159" cy="212" r="6" fill={accent} />
              </g>

              <g className="apa-feet">
                <path d="M76 245c13-10 29-10 43 0-11 11-30 12-43 0Z" fill="#f59e0b" />
                <path d="M121 245c14-10 30-10 43 0-12 12-31 12-43 0Z" fill="#f59e0b" />
              </g>
            </g>

            <g className="apa-bubbles" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" opacity="0.85">
              <path d="M197 67c9 0 16 7 16 16" />
              <path d="M202 49c18 2 31 15 33 33" opacity="0.45" />
            </g>

            <g className="apa-sleep" fill="#c7d2fe" opacity="0">
              <text x="169" y="69" fontSize="22" fontWeight="800">Z</text>
              <text x="190" y="46" fontSize="16" fontWeight="800">Z</text>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
