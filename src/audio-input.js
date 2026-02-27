/** @type {AudioContext | null} */
let audioContext = null;
/** @type {AnalyserNode | null} */
let analyserNode = null;
/** @type {MediaStreamAudioSourceNode | null} */
let mediaStreamAudioSourceNode = null;
/** @type {MediaStream | null} */
let micStream = null;

/**
 * Initialize audio context and request microphone access
 * @async
 * @throws {Error} If microphone access is denied
 * @returns {Promise<void>}
 */
export async function initAudio() {
  if (audioContext) {
    return; // Already initialized
  }

  try {
    // Get microphone access
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
      },
    });

    // Create audio context (standard Web Audio API).
    // In a browser environment the constructor is provided as a global.
    // No import is necessary.
    // Node or other non-browser runtimes won't have this object.
    audioContext = new AudioContext();

    // Create analyser node
    analyserNode = audioContext.createAnalyser();

    // FFT size in powers of 2 only.
    // [32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768]
    // Default is 2048, but we use 4096 for better low-frequency resolution.
    analyserNode.fftSize = 4096;

    // Higher = smoother FFT output but slower response
    analyserNode.smoothingTimeConstant = 0.8;

    // Connect microphone to analyser
    mediaStreamAudioSourceNode =
      audioContext.createMediaStreamSource(micStream);
    mediaStreamAudioSourceNode.connect(analyserNode);

    console.log("Audio initialized:", {
      sampleRate: audioContext.sampleRate,
      fftSize: analyserNode.fftSize,
    });
  } catch (error) {
    console.error("Audio initialization failed:", error);
    throw error;
  }
}

/**
 * Resume the audio context if it is suspended.
 *
 * This function is asynchronous because `AudioContext.resume()` returns a
 * Promise.
 * Any errors are caught to prevent unhandled-rejection warnings.
 *
 * @async
 * @returns {Promise<void>}
 */
export async function startAudio() {
  if (audioContext && audioContext.state === "suspended") {
    try {
      await audioContext.resume();
    } catch (err) {
      console.warn("AudioContext resume failed:", err);
    }
  }
}

/**
 * Completely stop audio and cleanup audio resources
 * (stops MediaStream tracks and closes the AudioContext)
 * @returns {void}
 */
export function stopAudio() {
  if (micStream) {
    // stop every track obtained from the stream
    const tracks = micStream.getTracks();
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].stop();
    }
    micStream = null;
  }

  if (mediaStreamAudioSourceNode) {
    mediaStreamAudioSourceNode.disconnect();
    mediaStreamAudioSourceNode = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  analyserNode = null;
}

/**
 * Read-only accessor for other modules (no globals).
 * @returns {{
 *   instance: AudioContext,
 *   analyserNode: AnalyserNode,
 *   sampleRate: number,
 *   getWaveform: () => Float32Array
 * } | null}
 */
export function getAudioContext() {
  if (!audioContext || !analyserNode) return null;
  // Capture local reference so the closure below
  // doesn't need to re-check null
  const node = analyserNode;
  return {
    instance: audioContext,
    analyserNode: node,
    sampleRate: audioContext.sampleRate,
    getWaveform: () => {
      const buffer = new Float32Array(node.fftSize);
      node.getFloatTimeDomainData(buffer);
      return buffer;
    },
  };
}

// Cleanup on page unload
window.addEventListener("beforeunload", stopAudio);
