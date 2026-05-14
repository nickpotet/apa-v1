import type { Language } from '../voice/providers/VoiceProvider';
import type { ScenarioId } from '../ui/ScenarioChips';
import responses from '../../../config/chip_responses.json';

type Clip = {
  id: string;
  text: string;
};

type ResponseManifest = Record<ScenarioId, Record<Language, Clip[]>>;

const MANIFEST = responses as ResponseManifest;

export class ChipResponsePlayer {
  private audio: HTMLAudioElement | null = null;

  play(id: ScenarioId, lang: Language, onStart: () => void, onDone: () => void): void {
    this.stop();

    const selectedLang = MANIFEST[id]?.[lang] ? lang : 'es';
    const clips = MANIFEST[id]?.[selectedLang] ?? [];
    const clip = clips[Math.floor(Math.random() * clips.length)];
    if (!clip) {
      onDone();
      return;
    }

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      onDone();
    };

    const audio = new Audio(`/audio/chips/${selectedLang}/${clip.id}.mp3`);
    this.audio = audio;
    audio.onplay = onStart;
    audio.onended = finish;
    audio.onerror = finish;
    audio.play().catch(finish);
  }

  stop(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.src = '';
    this.audio = null;
  }
}
