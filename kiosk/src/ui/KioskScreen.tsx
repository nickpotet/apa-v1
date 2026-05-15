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

const LANGUAGE_META: Record<Language, { flag: string; striped?: boolean }> = {
  es: { flag: '🇪🇸' },
  en: { flag: '🇬🇧' },
  ru: { flag: '🇷🇺' },
  ca: { flag: '', striped: true },
};

function LanguageFlag({ language }: { language: Language }) {
  const meta = LANGUAGE_META[language];

  if (meta.striped) {
    return (
      <span
        className="inline-grid h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/15 shadow-[0_0_0_1px_rgba(255,255,255,0.05)]"
        aria-hidden="true"
      >
        <span className="bg-[#f4c534]" />
        <span className="bg-[#cf2d36]" />
        <span className="bg-[#f4c534]" />
        <span className="bg-[#cf2d36]" />
        <span className="bg-[#f4c534]" />
        <span className="bg-[#cf2d36]" />
      </span>
    );
  }

  return <span className="text-2xl leading-none" aria-hidden="true">{meta.flag}</span>;
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
