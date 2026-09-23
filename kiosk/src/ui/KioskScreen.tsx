import type { Language } from '../voice/providers/VoiceProvider';
import type { KioskState } from '../types';
import { VENUE_NAME } from '../config/venueConfig';
import { VenueStatusBadge } from './VenueStatusBadge';
import { ApaDriver } from '../rive/ApaDriver';
import { TalkButton } from './TalkButton';
import { ScenarioChips } from './ScenarioChips';
import type { ScenarioId } from './ScenarioChips';
import { ConnectionFallback } from './ConnectionFallback';

interface Props {
  lang: Language;
  kioskState: KioskState;
  onTalkStart: () => void;
  onTalkEnd: () => void;
  onChipTap: (id: ScenarioId) => void;
  onLangChange: (l: Language) => void;
}

export const LANGS: Language[] = ['es', 'en', 'ru', 'ca', 'fr', 'de', 'uk', 'sr', 'it', 'pl'];

const LANGUAGE_META: Record<Language, {
  pattern: 'spain' | 'britain' | 'russia' | 'catalonia' | 'france' | 'germany' | 'ukraine' | 'serbia' | 'italy' | 'poland';
  nativeName: string;
}> = {
  es: { pattern: 'spain', nativeName: 'Español' },
  en: { pattern: 'britain', nativeName: 'English' },
  ru: { pattern: 'russia', nativeName: 'Русский' },
  ca: { pattern: 'catalonia', nativeName: 'Català' },
  fr: { pattern: 'france', nativeName: 'Français' },
  de: { pattern: 'germany', nativeName: 'Deutsch' },
  uk: { pattern: 'ukraine', nativeName: 'Українська' },
  sr: { pattern: 'serbia', nativeName: 'Srpski' },
  it: { pattern: 'italy', nativeName: 'Italiano' },
  pl: { pattern: 'poland', nativeName: 'Polski' },
};

export function LanguageFlag({ language }: { language: Language }) {
  const meta = LANGUAGE_META[language];
  const baseClass = 'relative inline-flex h-[22px] w-[22px] min-[430px]:h-[26px] min-[430px]:w-[26px] shrink-0 overflow-hidden rounded-full border border-white/20 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]';

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
  if (meta.pattern === 'britain') {
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
  if (meta.pattern === 'france') {
    return (
      <span className={`${baseClass}`} aria-hidden="true">
        <span className="h-full flex-1 bg-[#1f4fa3]" />
        <span className="h-full flex-1 bg-[#f8fafc]" />
        <span className="h-full flex-1 bg-[#d43d3d]" />
      </span>
    );
  }
  if (meta.pattern === 'germany') {
    return (
      <span className={`${baseClass} flex-col`} aria-hidden="true">
        <span className="h-1/3 bg-[#171717]" />
        <span className="h-1/3 bg-[#d52b2b]" />
        <span className="h-1/3 bg-[#f4c430]" />
      </span>
    );
  }
  if (meta.pattern === 'ukraine') {
    return (
      <span className={`${baseClass} flex-col`} aria-hidden="true">
        <span className="h-1/2 bg-[#1e73be]" />
        <span className="h-1/2 bg-[#ffd43b]" />
      </span>
    );
  }
  if (meta.pattern === 'serbia') {
    return (
      <span className={`${baseClass} flex-col`} aria-hidden="true">
        <span className="h-1/3 bg-[#c6363c]" />
        <span className="h-1/3 bg-[#244b9b]" />
        <span className="h-1/3 bg-[#f8fafc]" />
        <span className="absolute left-[24%] top-[18%] h-[57%] w-[30%] rounded-b-[45%] border border-white/80 bg-[#c6363c]">
          <span className="absolute left-1/2 top-[16%] h-[56%] w-px -translate-x-1/2 bg-white" />
          <span className="absolute left-[18%] top-[37%] h-px w-[64%] bg-white" />
        </span>
      </span>
    );
  }
  if (meta.pattern === 'italy') {
    return (
      <span className={baseClass} aria-hidden="true">
        <span className="h-full flex-1 bg-[#149447]" />
        <span className="h-full flex-1 bg-[#f8fafc]" />
        <span className="h-full flex-1 bg-[#d43d3d]" />
      </span>
    );
  }
  if (meta.pattern === 'poland') {
    return (
      <span className={`${baseClass} flex-col`} aria-hidden="true">
        <span className="h-1/2 bg-[#f8fafc]" />
        <span className="h-1/2 bg-[#dc143c]" />
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

export function LanguageSelector({
  lang,
  onLangChange,
}: {
  lang: Language;
  onLangChange: (language: Language) => void;
}) {
  return (
    <div className="mx-auto flex w-fit max-w-full items-center justify-center gap-px rounded-full border border-white/25 bg-white/15 px-1 py-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.20)] backdrop-blur-md min-[430px]:gap-0.5 min-[430px]:px-1.5">
      {LANGS.map((language) => {
        const name = LANGUAGE_META[language].nativeName;
        return (
          <button
            key={language}
            onClick={() => onLangChange(language)}
            aria-label={name}
            aria-pressed={language === lang}
            title={name}
            className={`flex h-[29px] w-[29px] min-[430px]:h-9 min-[430px]:w-9 shrink-0 items-center justify-center rounded-full border transition-all ${
              language === lang
                ? 'border-sky-200/80 bg-sky-300/30 shadow-[0_0_18px_rgba(125,211,252,0.35)] text-white'
                : 'border-white/10 bg-white/[0.06] text-white/75 hover:border-white/20 hover:bg-white/[0.12]'
            }`}
          >
            <LanguageFlag language={language} />
          </button>
        );
      })}
    </div>
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
    <div className="relative flex h-full w-full flex-col overflow-hidden text-white">

      {/* ── Image-mirror wrapper: bg + penguin share one coord space pinned to image pixels ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ aspectRatio: '1672 / 941', minWidth: '100%', minHeight: '100%' }}
        >
          <img
            src="/bg.jpg"
            alt=""
            className="absolute inset-0 h-full w-full select-none"
            draggable={false}
          />
          {/* Penguin — feet at center of floating ice island */}
          <div
            className="absolute bottom-[39%] left-1/2 h-[42%] -translate-x-1/2 min-[430px]:bottom-[34%] min-[430px]:h-[47%]"
            style={{ aspectRatio: '4 / 5' }}
          >
            <ApaDriver kioskState={kioskState} lang={lang} />
          </div>
        </div>
      </div>

      {/* Top vignette — header readability over bright sky/clouds */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-[#050d1a]/65 to-transparent" />

      {/* Bottom vignette — buttons/chips on bright snow */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-[#050d1a]/75 via-[#050d1a]/35 to-transparent" />

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="relative flex shrink-0 items-center justify-between px-5 pt-5 pb-2">
        <span className="text-xs font-semibold tracking-widest text-white/80 uppercase drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)]">
          {VENUE_NAME}
        </span>
        <VenueStatusBadge lang={lang} />
      </header>

      {/* ── Language selector ──────────────────────────────────── */}
      <div className="relative shrink-0 px-5 pb-2">
        <LanguageSelector lang={lang} onLangChange={onLangChange} />
      </div>

      {/* Spacer keeps bottom controls pushed down */}
      <div className="flex-1" />

      <ConnectionFallback lang={lang} kioskState={kioskState} />

      {/* ── Talk button ────────────────────────────────────────── */}
      <div className="relative shrink-0 py-4">
        <TalkButton
          lang={lang}
          kioskState={kioskState}
          onTalkStart={onTalkStart}
          onTalkEnd={onTalkEnd}
        />
      </div>

      {/* ── Scenario chips ─────────────────────────────────────── */}
      <div className="relative shrink-0 pb-7">
        <ScenarioChips lang={lang} disabled={isBusy} onChipTap={onChipTap} />
      </div>

    </div>
  );
}
