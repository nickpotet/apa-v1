import type { Language } from '../voice/providers/VoiceProvider';
import type { KioskState } from '../types';
import { VENUE_NAME } from '../config/venueConfig';
import { VenueStatusBadge } from './VenueStatusBadge';
import { ApaDriver } from '../rive/ApaDriver';
import { TalkButton } from './TalkButton';
import { ScenarioChips } from './ScenarioChips';
import type { ScenarioId } from './ScenarioChips';
import { QrBlock } from './QrBlock';

interface Props {
  lang: Language;
  kioskState: KioskState;
  onTalkStart: () => void;
  onTalkEnd: () => void;
  onChipTap: (id: ScenarioId) => void;
  onLangChange: (l: Language) => void;
}

const LANGS: Language[] = ['es', 'en', 'ru', 'ca'];

const LANGUAGE_META: Record<Language, { flag: string; name: string; hint: string; striped?: boolean }> = {
  es: { flag: '🇪🇸', name: 'Español', hint: 'Habla conmigo' },
  en: { flag: '🇬🇧', name: 'English', hint: 'Talk to me' },
  ru: { flag: '🇷🇺', name: 'Русский', hint: 'Поговори со мной' },
  ca: { flag: '', name: 'Català', hint: 'Parla amb mi', striped: true },
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

      <div className="shrink-0 px-4 pb-3">
        <div className="mx-auto grid max-w-2xl grid-cols-2 gap-2 rounded-[28px] border border-white/10 bg-white/6 p-2 backdrop-blur-sm">
        {LANGS.map((l) => (
          <button
            key={l}
            onClick={() => onLangChange(l)}
            className={`flex min-h-16 items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all ${
              l === lang
                ? 'border-sky-300/80 bg-sky-400/18 text-white shadow-[0_0_30px_rgba(56,189,248,0.18)]'
                : 'border-white/6 bg-white/[0.03] text-white/78 hover:border-white/12 hover:bg-white/[0.06]'
            }`}
          >
            <LanguageFlag language={l} />
            <span className="min-w-0">
              <span className="block text-base font-semibold leading-tight">{LANGUAGE_META[l].name}</span>
              <span className={`block text-[11px] leading-tight ${l === lang ? 'text-sky-100/90' : 'text-white/45'}`}>
                {LANGUAGE_META[l].hint}
              </span>
            </span>
          </button>
        ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ApaDriver kioskState={kioskState} lang={lang} />
      </div>

      <div className="shrink-0 py-4">
        <TalkButton
          lang={lang}
          kioskState={kioskState}
          onTalkStart={onTalkStart}
          onTalkEnd={onTalkEnd}
        />
      </div>

      <div className="shrink-0 pb-4">
        <ScenarioChips lang={lang} disabled={isBusy} onChipTap={onChipTap} />
      </div>

      <div className="shrink-0 pb-5">
        <QrBlock lang={lang} />
      </div>

    </div>
  );
}
