let permissionRequest: Promise<boolean> | null = null;

export function requestMicrophonePermission(): Promise<boolean> {
  permissionRequest ??= requestPermission();
  return permissionRequest;
}

async function requestPermission(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return false;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (err) {
    console.warn('[mic permission]', err);
    return false;
  }
}
