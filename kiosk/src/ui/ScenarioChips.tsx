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
          className="rounded-2xl border border-white/10 bg-white/5 px-2 py-3.5 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 active:bg-white/15 disabled:opacity-30"
        >
          {chips[i]}
        </button>
      ))}
    </div>
  );
}
