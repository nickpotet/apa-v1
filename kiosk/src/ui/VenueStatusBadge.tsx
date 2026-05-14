import { useVenueStatus } from '../hooks/useVenueStatus';
import { UI_COPY } from '../config/venueConfig';
import type { Language } from '../voice/providers/VoiceProvider';

interface Props { lang: Language }

export function VenueStatusBadge({ lang }: Props) {
  const status = useVenueStatus();
  const copy = UI_COPY[lang];

  const { label, dot } = (() => {
    switch (status.kind) {
      case 'open':     return { label: copy.statusOpen,                 dot: 'bg-green-400' };
      case 'lastCall': return { label: copy.statusLastCall,             dot: 'bg-amber-400 animate-pulse' };
      case 'siesta':   return { label: copy.statusSiesta(status.opensAt),  dot: 'bg-sky-500' };
      case 'closed':   return { label: copy.statusClosed(status.opensAt),  dot: 'bg-slate-500' };
    }
  })();

  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <span className="text-sm font-medium text-white/70">{label}</span>
    </div>
  );
}
