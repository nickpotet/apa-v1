import type { Language } from '../voice/providers/VoiceProvider';
import type { KioskState } from '../types';
import { VENUE_NAME } from '../config/venueConfig';
import { VenueStatusBadge } from './VenueStatusBadge';
import { ApaDriver } from '../rive/ApaDriver';
import { TalkButton } from './TalkButton';
import { ScenarioChips } from './ScenarioChips';
import type { ScenarioId } from './ScenarioChips';
import { ConnectionFallback } from './ConnectionFallback';
import type { TalkMode } from '../audio/inputs/InputSource';

interface Props {
  lang: Language;
  kioskState: KioskState;
  onTalkStart: (mode?: TalkMode) => void;
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

/** Serbian state flag: red/blue/white tricolour with the lesser coat of arms
 *  (white double-headed eagle, wings inverted, on a red shield under a gold crown),
 *  set toward the hoist by 1/7 of the flag's length. Proportions and position were
 *  checked side by side against the official flag at badge size (22–26px).
 *  Colours: red #C7363D (Pantone 1797C), blue #0C4077 (Pantone 541C). */
function SerbiaFlag() {
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
      <rect width="100" height="33.4" fill="#C7363D"/>
      <rect y="33.3" width="100" height="33.4" fill="#0C4077"/>
      <rect y="66.6" width="100" height="33.4" fill="#FFFFFF"/>
      <path d="M13 27.5 C13 17 45 17 45 27.5 Z" fill="#E0B048"/>
      <rect x="12" y="26.6" width="34" height="5.4" rx="1.2" fill="#E0B048"/>
      <path d="M29 18 V26.6 M21 19.8 Q22.6 23.4 21.6 26.6 M37 19.8 Q35.4 23.4 36.4 26.6" stroke="#B8862B" strokeWidth="0.9" fill="none"/>
      <circle cx="29" cy="16" r="2.1" fill="#E0B048"/>
      <rect x="28.3" y="8.6" width="1.4" height="6" fill="#E0B048"/>
      <rect x="26.5" y="10.4" width="5" height="1.4" fill="#E0B048"/>
      <circle cx="18.5" cy="29.3" r="1.1" fill="#C7363D"/><circle cx="29" cy="29.3" r="1.1" fill="#0C4077"/><circle cx="39.5" cy="29.3" r="1.1" fill="#C7363D"/>
      <path d="M10.5 32 H47.5 V64 A18.5 18.5 0 0 1 10.5 64 Z" fill="#C7363D" stroke="#FFFFFF" strokeWidth="0.8"/>
      <g fill="#FFFFFF">
      <path d="M24 42 L19 39.5 L13.5 39.5 L12.5 44 L14.2 45 L12.4 49 L14.4 50 L12.6 54.5 L14.8 55.5 L13.4 60 L15.8 60.6 L15 65.5 L17.8 65 L18.4 69.5 L20.4 66.5 L24 62 Z"/>
      <path d="M34 42 L39 39.5 L44.5 39.5 L45.5 44 L43.8 45 L45.6 49 L43.6 50 L45.4 54.5 L43.2 55.5 L44.6 60 L42.2 60.6 L43 65.5 L40.2 65 L39.6 69.5 L37.6 66.5 L34 62 Z"/>
      <path d="M26.4 45.5 L20.4 39 L22.8 36.8 L29 42.6 L35.2 36.8 L37.6 39 L31.6 45.5 Z"/>
      <circle cx="21.6" cy="36.9" r="2.8"/><circle cx="36.4" cy="36.9" r="2.8"/>
      <ellipse cx="29" cy="55" rx="6.2" ry="10"/>
      <path d="M25 63.5 L23.6 73 L26.6 71.8 L29 75.8 L31.4 71.8 L34.4 73 L33 63.5 Z"/>
      </g>
      <path d="M25.6 64 L20.2 71.6 M32.4 64 L37.8 71.6" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round"/>
      <g fill="#E0B048">
      <path d="M18.3 36.3 L15.2 37.3 L18.4 38.4 Z M39.7 36.3 L42.8 37.3 L39.6 38.4 Z"/>
      <path d="M19.4 71 L17.6 74.4 L20.4 73.2 Z M38.6 71 L40.4 74.4 L37.6 73.2 Z"/>
      <path d="M17.6 74.2 L16.6 77 L17.6 79 L18.6 77 Z M40.4 74.2 L39.4 77 L40.4 79 L41.4 77 Z"/>
      <circle cx="16" cy="76.6" r="0.9"/><circle cx="19.2" cy="76.6" r="0.9"/><circle cx="38.8" cy="76.6" r="0.9"/><circle cx="42" cy="76.6" r="0.9"/>
      </g>
      <path d="M23.5 47 H34.5 V57 A5.5 5.5 0 0 1 23.5 57 Z" fill="#C7363D" stroke="#FFFFFF" strokeWidth="0.6"/>
      <path d="M29 47 V62.5 M23.5 53.4 H34.5" stroke="#FFFFFF" strokeWidth="1.2"/>
      <path d="M27 48.9 A1.5 1.5 0 1 0 27 51.9 M31 48.9 A1.5 1.5 0 1 1 31 51.9 M27 55 A1.5 1.5 0 1 0 27 58 M31 55 A1.5 1.5 0 1 1 31 58" stroke="#FFFFFF" strokeWidth="0.7" fill="none"/>
    </svg>
  );
}

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
      <span className={baseClass} aria-hidden="true">
        <SerbiaFlag />
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
