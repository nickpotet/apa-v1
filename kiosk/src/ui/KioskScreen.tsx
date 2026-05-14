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
  onChipTap: (id: ScenarioId) => void; // Day 3 wires to VoiceProvider
  onLangChange: (l: Language) => void; // dev helper removed before deploy
}

const LANGS: Language[] = ['es', 'en', 'ru', 'ca'];

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

      {/* ── Header ── */}
      <header className="flex shrink-0 items-center justify-between px-5 pt-4 pb-2">
        <span className="text-xs font-semibold tracking-widest text-white/30 uppercase">
          {VENUE_NAME}
        </span>
        <VenueStatusBadge lang={lang} />
      </header>

      {/* ── Dev lang switcher — remove before deploy ── */}
      <div className="flex shrink-0 justify-center gap-2 pb-2">
        {LANGS.map((l) => (
          <button
            key={l}
            onClick={() => onLangChange(l)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              l === lang ? 'bg-sky-500 text-white' : 'text-white/30 hover:text-white/60'
            }`}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ── Penguin canvas ── */}
      <div className="min-h-0 flex-1">
        <ApaDriver kioskState={kioskState} lang={lang} />
      </div>

      {/* ── Talk button ── */}
      <div className="shrink-0 py-4">
        <TalkButton
          lang={lang}
          kioskState={kioskState}
          onTalkStart={onTalkStart}
          onTalkEnd={onTalkEnd}
        />
      </div>

      {/* ── Scenario chips ── */}
      <div className="shrink-0 pb-4">
        <ScenarioChips lang={lang} disabled={isBusy} onChipTap={onChipTap} />
      </div>

      {/* ── QR block ── */}
      <div className="shrink-0 pb-5">
        <QrBlock lang={lang} />
      </div>

    </div>
  );
}
