const SEMITONE_RATIO = 2 ** (1 / 12);
const DEFAULT_REFERENCE_FREQUENCY = 440; // A4
const REFERENCE_MIDI = 69; // MIDI note number for A4

/** @type {number} */
let referenceFrequency = DEFAULT_REFERENCE_FREQUENCY;

const NOTE_NAMES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];

/**
 * Convert frequency to MIDI note number (floating point)
 * MIDI: C-1 = 0, C0 = 12, A4 = 69, C8 = 108
 * Uses referenceFrequency (default A4 = 440 Hz) and REFERENCE_MIDI (69)
 * @param {number} frequency - Frequency in Hz
 * @returns {number} MIDI note number (floating point)
 */
function frequencyToMidiNote(frequency) {
  return REFERENCE_MIDI + 12 * Math.log2(frequency / referenceFrequency);
}

/**
 * Convert MIDI note number to frequency
 * @param {number} midiNote - MIDI note number (0-127)
 * @returns {number} Frequency in Hz
 */
function midiNoteToFrequency(midiNote) {
  return referenceFrequency * SEMITONE_RATIO ** (midiNote - REFERENCE_MIDI);
}

/**
 * Get note name from MIDI note number
 * @param {number} midiNote - MIDI note number (0-127)
 * @returns {{name: string, octave: number}} Note information
 */
function midiNoteToName(midiNote) {
  // position within the 12‑note octave cycle (0=C, 1=C♯, … 11=B)
  const noteIndex = midiNote % 12;
  const name = NOTE_NAMES[noteIndex];

  const octave = Math.floor(midiNote / 12) - 1;

  return { name, octave };
}

/**
 * Get the current reference frequency.
 * @returns {number} Reference frequency in Hz
 */
export function getReferenceFrequency() {
  return referenceFrequency;
}

/**
 * Set a new reference frequency for A4.
 * @param {number} frequency - Reference frequency in Hz (finite and > 0)
 * @returns {void}
 */
export function setReferenceFrequency(frequency) {
  if (!Number.isFinite(frequency) || frequency <= 0) {
    throw new RangeError(
      `Reference frequency must be a finite number > 0, got ${frequency}`,
    );
  }
  referenceFrequency = frequency;
}

/**
 * Convert frequency to note with cents offset
 * @param {number} frequency - Frequency in Hz
 * @returns {{
 *   name: string,
 *   octave: number,
 *   cents: number,
 *   frequency: number,
 *   targetFrequency: number,
 *   midiNote: number,
 *   displayName: string,
 *   inTune: boolean,
 *   almostInTune: boolean
 * } | null} Note information with tuning data, or null if invalid frequency
 */
export function frequencyToNote(frequency) {
  if (!frequency || frequency <= 0) {
    return null;
  }

  const midiNote = frequencyToMidiNote(frequency);
  const nearestMidiNote = Math.round(midiNote);

  const cents = 100 * (midiNote - nearestMidiNote);

  const { name, octave } = midiNoteToName(nearestMidiNote);
  const targetFrequency = midiNoteToFrequency(nearestMidiNote);

  return {
    name,
    octave,
    cents, // -50 to +50 cents from target
    frequency, // Detected frequency
    targetFrequency, // Expected frequency for the note
    midiNote: nearestMidiNote, // rounded/target note
    displayName: `${name}${octave}`,
    inTune: Math.abs(cents) < 5,
    almostInTune: Math.abs(cents) < 20,
  };
}
