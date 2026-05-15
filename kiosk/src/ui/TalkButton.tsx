import type { KioskState } from '../types';
import type { Language } from '../voice/providers/VoiceProvider';
import { UI_COPY } from '../config/venueConfig';

interface Props {
  lang: Language;
  kioskState: KioskState;
  onTalkStart: () => void;
  onTalkEnd: () => void;
}

export function TalkButton({ lang, kioskState, onTalkStart, onTalkEnd }: Props) {
  const copy = UI_COPY[lang];
  const isListening = kioskState === 'listening';
  const isPreparing = kioskState === 'preparing';
  const isBusy      = isPreparing || isListening || kioskState === 'thinking' || kioskState === 'speaking';
  const isBlocked   = kioskState === 'capped' || kioskState === 'offline';

  const label = (() => {
    switch (kioskState) {
      case 'preparing': return copy.preparing;
      case 'listening': return copy.talkButtonHeld;
      case 'thinking':  return copy.thinking;
      case 'speaking':  return copy.speaking;
      case 'error':     return copy.error;
      case 'capped':    return copy.capped;
      case 'offline':   return copy.offline;
      default:          return copy.talkButton;
    }
  })();

  const cls = (() => {
    if (isPreparing) return 'cursor-default bg-sky-500/70 text-white/80';
    if (isListening) return 'scale-[0.97] bg-sky-300 text-[#0b0f1a] shadow-[0_0_56px_rgba(125,211,252,0.6)]';
    if (kioskState === 'error') return 'cursor-default bg-red-500/80 text-white';
    if (isBusy)      return 'cursor-default bg-white/8 text-white/40';
    if (isBlocked)   return 'cursor-default bg-white/5 text-white/25';
    return 'bg-sky-500 text-white shadow-[0_0_40px_rgba(14,165,233,0.4)] hover:bg-sky-400 active:scale-[0.97] active:bg-sky-300';
  })();

  return (
    <div className="flex w-full justify-center px-8">
      <button
        className={[
          'w-full max-w-sm rounded-3xl px-8 py-7 text-2xl font-bold transition-all duration-150 select-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300',
          cls,
        ].join(' ')}
        onPointerDown={() => { if (!isBusy && !isBlocked && kioskState !== 'error') onTalkStart(); }}
        onPointerUp={onTalkEnd}
        onPointerLeave={() => { if (isPreparing || isListening) onTalkEnd(); }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {label}
      </button>
    </div>
  );
}
