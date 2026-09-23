import type { KioskState } from '../types';
import type { Language } from '../voice/providers/VoiceProvider';
import { UI_COPY } from '../config/venueConfig';
import type { TalkMode } from '../audio/inputs/InputSource';

interface Props {
  lang: Language;
  kioskState: KioskState;
  onTalkStart: (mode: TalkMode) => void;
  onTalkEnd: () => void;
}

export function TalkButton({ lang, kioskState, onTalkStart, onTalkEnd }: Props) {
  const copy = UI_COPY[lang];
  const isTouchDevice = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  const isListening = kioskState === 'listening';
  const isPreparing = kioskState === 'preparing';
  const isRecording = isPreparing || isListening;
  const isBusy      = isPreparing || isListening || kioskState === 'thinking' || kioskState === 'speaking';
  const isBlocked   = kioskState === 'capped' || kioskState === 'offline';

  const label = (() => {
    switch (kioskState) {
      case 'preparing': return copy.preparing;
      case 'listening': return isTouchDevice ? copy.talkButtonTouchHeld : copy.talkButtonHeld;
      case 'thinking':  return copy.thinking;
      case 'speaking':  return copy.speaking;
      case 'error':     return copy.error;
      case 'capped':    return copy.capped;
      case 'offline':   return copy.offline;
      default:          return isTouchDevice ? copy.talkButtonTouch : copy.talkButton;
    }
  })();

  const cls = (() => {
    if (isPreparing) return 'cursor-default bg-sky-400/60 text-white/80 backdrop-blur-sm';
    if (isListening) return 'scale-[0.97] bg-sky-200/90 text-[#0b1f3a] shadow-[0_0_56px_rgba(125,211,252,0.65)] backdrop-blur-sm';
    if (kioskState === 'error') return 'cursor-default bg-red-500/85 text-white backdrop-blur-sm';
    if (isBusy)      return 'cursor-default bg-[#050d1a]/55 text-white/45 backdrop-blur-md';
    if (isBlocked)   return 'cursor-default bg-[#050d1a]/40 text-white/25 backdrop-blur-md';
    return 'bg-sky-500/90 text-white shadow-[0_0_40px_rgba(14,165,233,0.45),0_4px_20px_rgba(0,0,0,0.3)] backdrop-blur-sm hover:bg-sky-400/95 active:scale-[0.97] active:bg-sky-300/90';
  })();

  return (
    <div className="flex w-full justify-center px-8">
      <button
        className={[
          'w-full max-w-sm touch-none rounded-3xl px-8 py-7 text-2xl font-bold transition-all duration-150 select-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300',
          cls,
        ].join(' ')}
        onPointerDown={(e) => {
          const isTouch = e.pointerType !== 'mouse';
          e.preventDefault();
          if (isTouch) {
            if (isRecording) onTalkEnd();
            // Touch is tap-to-start / tap-to-stop; the app also ends it on silence.
            else if (!isBusy && !isBlocked && kioskState !== 'error') onTalkStart('toggle');
            return;
          }
          if (isBusy || isBlocked || kioskState === 'error') return;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          onTalkStart('hold');
        }}
        onClick={(e) => { if (isTouchDevice) e.preventDefault(); }}
        onPointerUp={(e) => {
          if (e.pointerType !== 'mouse') {
            e.preventDefault();
            return;
          }
          e.currentTarget.releasePointerCapture?.(e.pointerId);
          onTalkEnd();
        }}
        onPointerCancel={(e) => {
          if (e.pointerType !== 'mouse') {
            e.preventDefault();
            return;
          }
          e.currentTarget.releasePointerCapture?.(e.pointerId);
          onTalkEnd();
        }}
        onLostPointerCapture={(e) => {
          if (e.pointerType !== 'mouse') return;
          if (isPreparing || isListening) onTalkEnd();
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'mouse') return;
          if (isPreparing || isListening) onTalkEnd();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {label}
      </button>
    </div>
  );
}
