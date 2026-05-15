import type { Language } from '../voice/providers/VoiceProvider';
import type { KioskState } from '../types';
import { VENUE_NAME } from '../config/venueConfig';
import { VenueStatusBadge } from './VenueStatusBadge';
import { ApaDriver } from '../rive/ApaDriver';
import { TalkButton } from './TalkButton';
import { ScenarioChips } from './ScenarioChips';
import type { ScenarioId } from './ScenarioChips';

interface Props {
  lang: Language;
  kioskState: KioskState;
  onTalkStart: () => void;
  onTalkEnd: () => void;
  onChipTap: (id: ScenarioId) => void;
  onLangChange: (l: Language) => void;
}

const LANGS: Language[] = ['es', 'en', 'ru', 'ca'];

const LANGUAGE_META: Record<Language, { pattern: 'spain' | 'uk' | 'russia' | 'catalonia' }> = {
  es: { pattern: 'spain' },
  en: { pattern: 'uk' },
  ru: { pattern: 'russia' },
  ca: { pattern: 'catalonia' },
};

function LanguageFlag({ language }: { language: Language }) {
  const meta = LANGUAGE_META[language];
  const baseClass = 'relative inline-flex h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/15 shadow-[0_0_0_1px_rgba(255,255,255,0.05)]';

  if (meta.pattern === 'spain') {
    return (
      <span className={`${baseClass} flex-col`} aria-hidden="true">
        <span className="h-[26%] bg-[#b91c1c]" />
        <span className="relative flex-1 bg-[#f3c63d]">
          <span className="absolute left-[24%] top-1/2 h-2.5 w-2 -translate-y-1/2 rounded-[2px] bg-[#9f1239]" />
        </span>
        <span className="h-[26%] bg-[#b91c1c]" />
      </span>
    );
  }

  if (meta.pattern === 'uk') {
    return (
      <span className={`${baseClass} bg-[#1d3f8f]`} aria-hidden="true">
        <span className="absolute inset-0 bg-[linear-gradient(35deg,transparent_41%,#fff_41%,#fff_49%,transparent_49%,transparent_51%,#fff_51%,#fff_59%,transparent_59%),linear-gradient(-35deg,transparent_41%,#fff_41%,#fff_49%,transparent_49%,transparent_51%,#fff_51%,#fff_59%,transparent_59%)]" />
        <span className="absolute inset-0 bg-[linear-gradient(35deg,transparent_45%,#c81e1e_45%,#c81e1e_50%,transparent_50%,transparent_54%,#c81e1e_54%,#c81e1e_59%,transparent_59%),linear-gradient(-35deg,transparent_45%,#c81e1e_45%,#c81e1e_50%,transparent_50%,transparent_54%,#c81e1e_54%,#c81e1e_59%,transparent_59%)]" />
        <span className="absolute left-1/2 top-0 h-full w-[28%] -translate-x-1/2 bg-white" />
        <span className="absolute left-0 top-1/2 h-[28%] w-full -translate-y-1/2 bg-white" />
        <span className="absolute left-1/2 top-0 h-full w-[14%] -translate-x-1/2 bg-[#c81e1e]" />
        <span className="absolute left-0 top-1/2 h-[14%] w-full -translate-y-1/2 bg-[#c81e1e]" />
      </span>
    );
  }

  if (meta.pattern === 'russia') {
    return (
      <span className={`${baseClass} flex-col`} aria-hidden="true">
        <span className="h-1/3 bg-[#f8fafc]" />
        <span className="h-1/3 bg-[#2457c5]" />
        <span className="h-1/3 bg-[#c53333]" />
      </span>
    );
  }

  return (
    <span className={`${baseClass} flex-col`} aria-hidden="true">
      <span className="flex-1 bg-[#f4c534]" />
      <span className="flex-1 bg-[#cf2d36]" />
      <span className="flex-1 bg-[#f4c534]" />
      <span className="flex-1 bg-[#cf2d36]" />
      <span className="flex-1 bg-[#f4c534]" />
      <span className="flex-1 bg-[#cf2d36]" />
    </span>
  );
}

export function KioskScreen({
  lang,
  kioskState,
  onTalkStart,
  onTalkEnd,
  onChipTap,
  onLangChange,
}: Props) {
  const isBusy = kioskState !== 'idle';

  return (
    <div className="flex h-full w-full flex-col bg-[#0b0f1a] text-white">

      <header className="flex shrink-0 items-center justify-between px-5 pt-4 pb-2">
        <span className="text-xs font-semibold tracking-widest text-white/30 uppercase">
          {VENUE_NAME}
        </span>
        <VenueStatusBadge lang={lang} />
      </header>

      <div className="shrink-0 px-5 pb-2">
        <div className="mx-auto flex max-w-sm items-center justify-center gap-2 rounded-full border border-white/10 bg-white/7 px-2 py-2 backdrop-blur-sm">
        {LANGS.map((l) => (
          <button
            key={l}
            onClick={() => onLangChange(l)}
            className={`flex h-14 w-14 items-center justify-center rounded-full border transition-all ${
              l === lang
                ? 'border-sky-300/80 bg-sky-400/18 text-white shadow-[0_0_30px_rgba(56,189,248,0.18)]'
                : 'border-white/6 bg-white/[0.03] text-white/78 hover:border-white/12 hover:bg-white/[0.06]'
            }`}
          >
            <LanguageFlag language={l} />
          </button>
        ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-end pt-1">
        <ApaDriver kioskState={kioskState} lang={lang} />
      </div>

      <div className="shrink-0 py-5">
        <TalkButton
          lang={lang}
          kioskState={kioskState}
          onTalkStart={onTalkStart}
          onTalkEnd={onTalkEnd}
        />
      </div>

      <div className="shrink-0 pb-6">
        <ScenarioChips lang={lang} disabled={isBusy} onChipTap={onChipTap} />
      </div>

    </div>
  );
}
