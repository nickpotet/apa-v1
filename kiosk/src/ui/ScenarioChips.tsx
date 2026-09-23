import type { Language } from '../voice/providers/VoiceProvider';
import { UI_COPY } from '../config/venueConfig';

export const SCENARIO_IDS = [
  'family', 'couple', 'photoHobbyist', 'gift', 'howMuch', 'curiosity',
] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

interface Props {
  lang: Language;
  disabled?: boolean;
  onChipTap: (id: ScenarioId) => void;
}

export function ScenarioChips({ lang, disabled = false, onChipTap }: Props) {
  const chips = UI_COPY[lang].chips;
  return (
    <div className="grid w-full grid-cols-3 gap-2 px-5">
      {SCENARIO_IDS.map((id, i) => (
        <button
          key={id}
          disabled={disabled}
          onClick={() => onChipTap(id)}
          className="rounded-2xl border border-white/15 bg-[#050d1a]/60 px-2 py-3.5 text-sm font-medium text-white/85 shadow-[0_2px_12px_rgba(0,0,0,0.25)] backdrop-blur-md transition-colors hover:bg-[#050d1a]/75 hover:border-white/25 active:bg-[#050d1a]/80 disabled:opacity-30"
        >
          {chips[i]}
        </button>
      ))}
    </div>
  );
}
