import { speechAudioConstraints } from './speechCapture';

let permissionRequest: Promise<boolean> | null = null;
let permissionGranted = false;

export function requestMicrophonePermission(forceRetry = false): Promise<boolean> {
  if (permissionGranted) return Promise.resolve(true);
  if (forceRetry) permissionRequest = null;

  permissionRequest ??= requestPermission().then((granted) => {
    permissionGranted = granted;
    if (!granted) permissionRequest = null;
    return granted;
  });

  return permissionRequest;
}

async function requestPermission(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return false;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: speechAudioConstraints(),
    });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (err) {
    console.warn('[mic permission]', err);
    return false;
  }
}
