export type SpeechCaptureDiagnostics = {
  supported: {
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
    channelCount: boolean;
  };
  settings: {
    echoCancellation: boolean | null;
    noiseSuppression: boolean | null;
    autoGainControl: boolean | null;
    channelCount: number | null;
    sampleRate: number | null;
  };
  constraintsApplied: boolean;
  contentHint: string;
};

function supportedSpeechConstraints(): MediaTrackSupportedConstraints {
  return navigator.mediaDevices?.getSupportedConstraints?.() ?? {};
}

export function speechAudioConstraints(): MediaTrackConstraints {
  const supported = supportedSpeechConstraints();
  const constraints: MediaTrackConstraints = {};

  if (supported.channelCount) constraints.channelCount = { ideal: 1 };
  if (supported.echoCancellation) constraints.echoCancellation = { ideal: true };
  if (supported.noiseSuppression) constraints.noiseSuppression = { ideal: true };
  if (supported.autoGainControl) constraints.autoGainControl = { ideal: true };

  return constraints;
}

export async function configureSpeechTrack(track: MediaStreamTrack): Promise<SpeechCaptureDiagnostics> {
  const supported = supportedSpeechConstraints();
  const constraints = speechAudioConstraints();
  let constraintsApplied = false;

  try {
    track.contentHint = 'speech';
  } catch {}

  try {
    await track.applyConstraints(constraints);
    constraintsApplied = true;
  } catch (error) {
    console.warn('[audio] speech constraints were not fully applied', error);
  }

  const settings = track.getSettings();
  return {
    supported: {
      echoCancellation: Boolean(supported.echoCancellation),
      noiseSuppression: Boolean(supported.noiseSuppression),
      autoGainControl: Boolean(supported.autoGainControl),
      channelCount: Boolean(supported.channelCount),
    },
    settings: {
      echoCancellation: settings.echoCancellation ?? null,
      noiseSuppression: settings.noiseSuppression ?? null,
      autoGainControl: settings.autoGainControl ?? null,
      channelCount: settings.channelCount ?? null,
      sampleRate: settings.sampleRate ?? null,
    },
    constraintsApplied,
    contentHint: track.contentHint,
  };
}
