import type { Language } from '../voice/providers/VoiceProvider';
import type { KioskState } from '../types';
import { VENUE_NAME } from '../config/venueConfig';
import { ApaDriver } from '../rive/ApaDriver';
import { TalkButton } from './TalkButton';
import { LanguageSelector } from './KioskScreen';
import { ConnectionFallback } from './ConnectionFallback';
import type { TalkMode } from '../audio/inputs/InputSource';

interface Props {
  lang: Language;
  kioskState: KioskState;
  hall: string | null;
  stand: string | null;
  onTalkStart: (mode?: TalkMode) => void;
  onTalkEnd: () => void;
  onLangChange: (l: Language) => void;
}

const INTRO: Record<Language, {
  title: string;
  subtitle: string;
  hint: string;
  location: string;
  hall: string;
  stand: string;
  full: string;
}> = {
  es: {
    title: 'Apa guía',
    subtitle: 'Pregunta sobre las salas, fotos, pingüinos, realidad virtual o la historia de la expedición.',
    hint: 'Toca para hablar. Apa responde en tu idioma.',
    location: 'Contexto',
    hall: 'Sala', stand: 'Puesto', full: 'Exposición completa',
  },
  en: {
    title: 'Apa guide',
    subtitle: 'Ask about the rooms, photos, penguins, virtual reality, or the expedition story.',
    hint: 'Tap to talk. Apa answers in your language.',
    location: 'Context',
    hall: 'Hall', stand: 'Stand', full: 'Full exhibition',
  },
  ru: {
    title: 'Апа-гид',
    subtitle: 'Спроси про залы, фотографии, пингвинов, виртуальную реальность или историю экспедиции.',
    hint: 'Нажми, чтобы говорить. Апа ответит на твоем языке.',
    location: 'Контекст',
    hall: 'Зал', stand: 'Стенд', full: 'Вся выставка',
  },
  ca: {
    title: 'Apa guia',
    subtitle: 'Pregunta sobre les sales, fotos, pingüins, realitat virtual o la història de l’expedició.',
    hint: "Toca per parlar. L'Apa respon en el teu idioma.",
    location: 'Context',
    hall: 'Sala', stand: 'Punt', full: 'Exposició completa',
  },
  fr: {
    title: 'Apa guide',
    subtitle: 'Pose une question sur les salles, les photos, les pingouins, la réalité virtuelle ou l’histoire de l’expédition.',
    hint: 'Touche pour parler. Apa répond dans ta langue.',
    location: 'Contexte',
    hall: 'Salle', stand: 'Point', full: 'Exposition complète',
  },
  de: {
    title: 'Apa Guide',
    subtitle: 'Frag nach den Räumen, Fotos, Pinguinen, virtueller Realität oder der Geschichte der Expedition.',
    hint: 'Tippe zum Sprechen. Apa antwortet in deiner Sprache.',
    location: 'Kontext',
    hall: 'Saal', stand: 'Station', full: 'Gesamte Ausstellung',
  },
  uk: {
    title: 'Апа-гід',
    subtitle: 'Запитай про зали, фотографії, пінгвінів, віртуальну реальність або історію експедиції.',
    hint: 'Натисни, щоб говорити. Апа відповість твоєю мовою.',
    location: 'Контекст',
    hall: 'Зал', stand: 'Стенд', full: 'Уся виставка',
  },
  sr: {
    title: 'Apa vodič',
    subtitle: 'Pitaj o salama, fotografijama, pingvinima, virtuelnoj realnosti ili priči o ekspediciji.',
    hint: 'Dodirni za razgovor. Apa odgovara na tvom jeziku.',
    location: 'Kontekst',
    hall: 'Sala', stand: 'Stanica', full: 'Cela izložba',
  },
  it: {
    title: 'Apa guida',
    subtitle: 'Chiedi delle sale, delle foto, dei pinguini, della realtà virtuale o della storia della spedizione.',
    hint: 'Tocca per parlare. Apa risponde nella tua lingua.',
    location: 'Contesto',
    hall: 'Sala', stand: 'Postazione', full: 'Mostra completa',
  },
  pl: {
    title: 'Przewodnik Apa',
    subtitle: 'Zapytaj o sale, zdjęcia, pingwiny, wirtualną rzeczywistość lub historię wyprawy.',
    hint: 'Dotknij, aby mówić. Apa odpowie w twoim języku.',
    location: 'Kontekst',
    hall: 'Sala', stand: 'Stanowisko', full: 'Cała wystawa',
  },
};

function locationLabel(lang: Language, hall: string | null, stand: string | null): string {
  const copy = INTRO[lang];
  if (stand) return `${copy.stand} ${stand}`;
  if (hall) return `${copy.hall} ${hall}`;
  return copy.full;
}

export function GuideScreen({
  lang,
  kioskState,
  hall,
  stand,
  onTalkStart,
  onTalkEnd,
  onLangChange,
}: Props) {
  const copy = INTRO[lang];

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden text-white">
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
          <div
            className="absolute bottom-[39%] left-1/2 h-[42%] -translate-x-1/2 min-[430px]:bottom-[34%] min-[430px]:h-[47%]"
            style={{ aspectRatio: '4 / 5' }}
          >
            <ApaDriver kioskState={kioskState} lang={lang} />
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-[#050d1a]/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-80 bg-gradient-to-t from-[#050d1a]/80 via-[#050d1a]/35 to-transparent" />

      <header className="relative flex shrink-0 items-center justify-between px-5 pb-2 pt-5">
        <span className="text-xs font-semibold uppercase tracking-widest text-white/80 drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)]">
          {VENUE_NAME}
        </span>
        <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 shadow-[0_4px_20px_rgba(0,0,0,0.2)] backdrop-blur-md">
          {locationLabel(lang, hall, stand)}
        </span>
      </header>

      <div className="relative shrink-0 px-5 pb-2">
        <LanguageSelector lang={lang} onLangChange={onLangChange} />
      </div>

      <div className="flex-1" />

      <ConnectionFallback lang={lang} kioskState={kioskState} />

      <div className="relative mx-auto w-full max-w-md shrink-0 px-5 pb-2">
        <div className="rounded-3xl border border-white/18 bg-[#061225]/55 px-5 py-4 text-center shadow-[0_10px_38px_rgba(0,0,0,0.28)] backdrop-blur-md">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-sky-200/85">{copy.location}</p>
          <h1 className="mt-1 text-2xl font-black">{copy.title}</h1>
          <p className="mt-2 text-sm leading-snug text-white/86">{copy.subtitle}</p>
          <p className="mt-2 text-xs font-semibold text-sky-100/80">{copy.hint}</p>
        </div>
      </div>

      <div className="relative shrink-0 pb-8 pt-2">
        <TalkButton
          lang={lang}
          kioskState={kioskState}
          onTalkStart={onTalkStart}
          onTalkEnd={onTalkEnd}
        />
      </div>
    </div>
  );
}
