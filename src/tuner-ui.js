// -----------------------------------------------------------------------------
// configuration
// -----------------------------------------------------------------------------
const GAUGE_RANGE = 50; // ±50 cents displayed
const NEEDLE_CENTER = 50; // % position for center (in‑tune)

/**
 * Get a required element by id and narrow its type for the checker.
 * @param {string} id
 * @returns {HTMLElement}
 */
function getRequiredElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required DOM element: #${id}`);
  return element;
}

// cached DOM elements
const noteName = getRequiredElement("noteName");
const noteFrequency = getRequiredElement("noteFrequency");
const needle = getRequiredElement("needle");

// -----------------------------------------------------------------------------
// public API
// -----------------------------------------------------------------------------
/**
 * Update all UI elements based on detected note
 * @param {{
 *   name: string,
 *   octave: number,
 *   cents: number,
 *   frequency: number,
 *   targetFrequency: number,
 *   midiNote: number,
 *   displayName: string,
 *   inTune: boolean,
 *   almostInTune: boolean
 * } | null} note - Note data or null to reset display
 * @returns {void}
 */
export function updateUI(note) {
  if (!note) {
    // No note detected
    noteName.textContent = "—";
    // keep the selector so styles continue to apply
    noteName.className = "note-name";
    noteFrequency.textContent = "0.0 Hz";
    resetNeedle();
    return;
  }

  // Update note name and clear any class left over from the previous note
  noteName.textContent = note.displayName;
  // retain .note-name and clear any other custom classes later if needed
  noteName.className = "note-name";

  // Update frequency display
  noteFrequency.textContent = `${note.frequency.toFixed(1)} Hz`;

  // Update needle position and color
  updateNeedle(note.cents, note.inTune, note.almostInTune);
}

// -----------------------------------------------------------------------------
// internal helpers
// -----------------------------------------------------------------------------
/**
 * Update the cents gauge needle position and color
 * @param {number} cents - Cents offset from target (-50 to +50)
 * @param {boolean} inTune - Whether note is in tune (±5 cents)
 * @param {boolean} almostInTune - Whether note is almost in tune (±20 cents)
 * @returns {void}
 */
function updateNeedle(cents, inTune, almostInTune) {
  // Clamp cents to displayable range
  const clampedCents = Math.max(-GAUGE_RANGE, Math.min(GAUGE_RANGE, cents));

  // Convert cents to percentage (0-100, where 50 = in-tune)
  const needlePercent = NEEDLE_CENTER + (clampedCents / GAUGE_RANGE) * 50;

  // Update position
  needle.style.left = needlePercent + "%";

  // Update color based on how in-tune we are
  needle.className = "gauge-needle";
  if (inTune) {
    needle.classList.add("in-tune");
  } else if (almostInTune) {
    needle.classList.add("out-of-tune");
  } else {
    needle.classList.add("very-out-of-tune");
  }
}

/**
 * Reset needle to center (in-tune position)
 * @returns {void}
 */
function resetNeedle() {
  needle.style.left = "50%";
  needle.className = "gauge-needle";
}
