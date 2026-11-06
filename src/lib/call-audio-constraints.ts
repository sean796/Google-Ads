export function clampNoiseCancellationStrength(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 75;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function buildCallAudioConstraints(strength = 75): MediaTrackConstraints {
  const level = clampNoiseCancellationStrength(strength);
  if (level === 0) {
    return {
      noiseSuppression: false,
      echoCancellation: false,
      autoGainControl: false,
    };
  }

  const constraints: MediaTrackConstraints & { voiceIsolation?: boolean } = {
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: level >= 35,
  };

  if (typeof navigator !== "undefined" && navigator.mediaDevices?.getSupportedConstraints) {
    const supported = navigator.mediaDevices.getSupportedConstraints() as MediaTrackSupportedConstraints & {
      voiceIsolation?: boolean;
    };
    if (supported.voiceIsolation && level >= 55) {
      constraints.voiceIsolation = true;
    }
  }

  return constraints;
}

export async function applyCallAudioProcessing(
  track: MediaStreamTrack,
  strength = 75,
): Promise<void> {
  await track.applyConstraints(buildCallAudioConstraints(strength));
}

function gateThreshold(strength: number): number {
  const level = clampNoiseCancellationStrength(strength);
  if (level === 0) return 0;
  const t = level / 100;
  const min = 0.008;
  const max = 0.065;
  return min + t * t * (max - min);
}

export type CallAudioProcessorHandle = {
  stream: MediaStream;
  setStrength: (strength: number) => void;
  dispose: () => void;
};

export function createCallAudioProcessor(
  rawStream: MediaStream,
  strength: number,
): CallAudioProcessorHandle | null {
  const audioTrack = rawStream.getAudioTracks()[0];
  if (!audioTrack) return null;

  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.25;
  const gain = ctx.createGain();
  gain.gain.value = 1;
  const destination = ctx.createMediaStreamDestination();

  source.connect(analyser);
  analyser.connect(gain);
  gain.connect(destination);

  let strengthRef = clampNoiseCancellationStrength(strength);
  let raf = 0;
  const timeData = new Uint8Array(analyser.fftSize);

  const tick = () => {
    const level = strengthRef;
    if (level === 0) {
      gain.gain.value = 1;
      raf = requestAnimationFrame(tick);
      return;
    }

    analyser.getByteTimeDomainData(timeData);
    let sum = 0;
    for (let i = 0; i < timeData.length; i += 1) {
      const sample = (timeData[i] - 128) / 128;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / timeData.length);
    const threshold = gateThreshold(level);
    const target = rms >= threshold ? 1 : 0.02;
    gain.gain.value = gain.gain.value * 0.8 + target * 0.2;
    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);
  void ctx.resume();

  return {
    stream: destination.stream,
    setStrength: (next) => {
      strengthRef = clampNoiseCancellationStrength(next);
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      analyser.disconnect();
      gain.disconnect();
      destination.stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}

export function mergeProcessedCallStream(
  rawStream: MediaStream,
  processedAudio: MediaStream,
): MediaStream {
  const tracks = [...processedAudio.getAudioTracks(), ...rawStream.getVideoTracks()];
  return new MediaStream(tracks);
}
