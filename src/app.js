import {
  initAudio,
  startAudio,
  stopAudio,
  getAudioContext,
} from "./audio-input.js";
import { detectPitch } from "./yin-algorithm.js";
import { frequencyToNote } from "./note-mapping.js";
import { updateUI } from "./tuner-ui.js";

// ── constants ──
const SMOOTHING_FRAMES = 3;
/** @type {number} */
const CONFIDENCE_THRESHOLD = 0.15;

// ── application state ──
/** @type {boolean} */
let isRunning = false;
/** @type {number | null} */
let animationId = null;
/** @type {number[]} */
let frequencyHistory = [];
/** @type {boolean} */
let audioInitialized = false;

// DOM elements – initialized in initApp()
/** @type {HTMLButtonElement} */
let toggleButton;
/** @type {HTMLElement} */
let statusText;
/** @type {HTMLElement} */
let statusElement;

/**
 * Fetch a DOM element by ID and ensure it exists.
 * @param {string} id
 * @returns {HTMLElement}
 */
function getRequiredElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required DOM element: #${id}`);
  return element;
}

// ── utility helpers ──

/**
 * Return the arithmetic mean of a numeric array.
 * @param {number[]} array
 * @returns {number} 0 if the array is empty
 */
function average(array) {
  if (array.length === 0) return 0;

  let total = 0;
  for (let i = 0; i < array.length; i++) {
    total += array[i];
  }
  return total / array.length;
}

// ── audio helpers ──

/**
 * Request microphone access and initialize audio context
 * @async
 * @returns {Promise<void>}
 */
async function initializeAudio() {
  if (audioInitialized) return;

  try {
    statusText.textContent = "Requesting microphone access...";
    await initAudio();
    audioInitialized = true;
    statusText.textContent = "Ready to tune";
    statusElement.classList.remove("error");
    statusElement.classList.add("success");
  } catch (error) {
    console.error("Failed to initialize audio:", error);
    statusText.textContent = "Microphone access denied";
    statusElement.classList.add("error");
    toggleButton.disabled = true;
  }
}

/**
 * Start the tuning detection loop
 * @returns {void}
 */
function startTuning() {
  isRunning = true;
  frequencyHistory = []; // Clear history on start
  toggleButton.classList.add("active");
  toggleButton.textContent = "Stop Tuning";
  statusText.textContent = "Tuning...";
  statusElement.classList.remove("error");
  statusElement.classList.add("success");

  startAudio();
  detectionLoop();
}

/**
 * Stop the tuning detection loop and reset UI
 * @returns {void}
 */
function stopTuning() {
  isRunning = false;
  frequencyHistory = []; // Clear history on stop
  toggleButton.classList.remove("active");
  toggleButton.textContent = "Start Tuning";
  statusText.textContent = "Ready to tune";

  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  // Fully stop microphone and audio resources so iOS
  // stops showing the orange dot
  stopAudio();
  audioInitialized = false;

  // Reset display
  updateUI(null);
}

// ── detection loop ──

/**
 * Main detection loop - runs at ~60 fps via requestAnimationFrame
 * @returns {void}
 */
function detectionLoop() {
  if (!isRunning) return;

  try {
    // Get current waveform from audio input
    const audioContext = getAudioContext();
    if (!audioContext) {
      // audio not initialized — schedule next frame and exit this iteration
      animationId = requestAnimationFrame(detectionLoop);
      return;
    }
    const waveform = audioContext.getWaveform();
    const sampleRate = audioContext.sampleRate;

    // Detect pitch (returns { frequency, confidence } or null)
    const detection = detectPitch(waveform, sampleRate);

    let note = null;

    // Only use detection if confidence is low enough
    if (detection && detection.confidence < CONFIDENCE_THRESHOLD) {
      // Append value to the end of the array.
      frequencyHistory.push(detection.frequency);

      // Keep history size limited
      if (frequencyHistory.length > SMOOTHING_FRAMES) {
        // Removes the first element from the array
        frequencyHistory.shift();
      }

      // Use averaged frequency for smoother display
      const avgFrequency = average(frequencyHistory);
      note = frequencyToNote(avgFrequency);
    } else {
      // No confident detection - clear history
      frequencyHistory = [];
    }

    // Update UI
    updateUI(note);
  } catch (error) {
    console.error("Error in detection loop:", error);
  }

  animationId = requestAnimationFrame(detectionLoop);
}

// ── initialization ──

/**
 * Click handler for the toggle button.  Handles lazy audio setup and
 * starts/stops the tuning loop.
 * @returns {Promise<void>}
 */
async function handleToggleClick() {
  if (!audioInitialized) {
    await initializeAudio();
    if (!audioInitialized) return;
  }

  if (isRunning) {
    stopTuning();
  } else {
    startTuning();
  }
}

/**
 * Query DOM elements and attach event listeners. Called once on load.
 */
function initApp() {
  // DOM elements
  toggleButton = /** @type {HTMLButtonElement} */ (
    getRequiredElement("toggleButton")
  );
  statusText = getRequiredElement("statusText");
  statusElement = getRequiredElement("status");

  // button handler
  toggleButton.addEventListener("click", handleToggleClick);
}

// start the app
initApp();
