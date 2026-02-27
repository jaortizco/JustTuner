/**
 * YIN algorithm for pitch detection
 *
 * Implementation based on:
 * de Cheveigné, A., & Kawahara, H. (2002). YIN — a fundamental‑frequency
 * estimator for speech and music. Journal of the Acoustical Society of America,
 * 111(4), 1917–1930. DOI: https://doi.org/10.1121/1.1458024
 */

// For context, the lowest note of 5 string bass is B0 = 30.9 Hz.
// The highest note on a standard piano is C8 = 4186.01 Hz
const MIN_FREQUENCY = 27; // Hz
const MAX_FREQUENCY = 5000; // Hz
// To detect down to 27 Hz (A0/B0) at 44.1kHz, a max tau of ~1634 is needed.
// YIN compares a window (W) to a shifted version of itself (W + tau).
// Detecting these lows with 4096 samples requires at least 5730 total samples.
// The input buffer (fttsize) is a power of 2. Therefore, 8192 is needed.


// Internal YIN threshold for pitch candidate selection.
const THRESHOLD = 0.1; // Value suggested by the original YIN paper

/**
 * Detect pitch from audio waveform using YIN algorithm
 * @param {Float32Array} waveform - Time-domain audio samples
 * @param {number} sampleRate - Sample rate in Hz (e.g., 44100)
 * @returns {{frequency: number, confidence: number} | null}
 *   Detection result, or null if no pitch found
 */
export function detectPitch(waveform, sampleRate) {
  if (!waveform || waveform.length === 0) {
    return null;
  }

  // tau is the fundamental variable of the YIN algorithm.
  // It represents a time-shift (in samples) used to find the
  // repeating pattern in the waveform — the lag at which the
  // signal best matches a delayed copy of itself corresponds
  // to one full period of the fundamental frequency.
  const tauMin = Math.floor(sampleRate / MAX_FREQUENCY);
  const tauMax = Math.floor(sampleRate / MIN_FREQUENCY);

  const cmndf = computeCMNDF(waveform, tauMin, tauMax);

  // if computeCMNDF failed (e.g. no valid taus), quit early
  if (!cmndf) {
    return null;
  }

  const tau = findBestTau(cmndf, THRESHOLD, tauMin, tauMax);

  // Get the confidence value (minimum probability)
  const confidence = cmndf[tau];

  // Refine tau with parabolic interpolation (sub-sample precision)
  const refinedTau = refineTau(cmndf, tau);
  const frequency = sampleRate / refinedTau;

  // Validate frequency range
  if (frequency < MIN_FREQUENCY || frequency > MAX_FREQUENCY) {
    return null;
  }

  // Return frequency with confidence measure
  return {
    frequency,
    confidence, // Lower is more confident (0 = perfect, 1 = uncertain)
  };
}

/**
 * Steps 2 & 3 — Difference function + Cumulative Mean
 * Normalized Difference Function (CMNDF).
 * Computes how well the waveform matches a delayed copy
 * of itself at each tau, then normalizes so tau=0 does
 * not trivially win (CMNDF sets d'(0) = 1).
 * @param {Float32Array} audioSamples - Time-domain audio samples
 * @param {number} tauMin - Minimum tau in samples
 * @param {number} tauMax - Maximum tau in samples
 * @returns {Float32Array} Cumulative Mean Normalized Difference Function
 */
function computeCMNDF(audioSamples, tauMin, tauMax) {
  // Skip tau=0 (because difference is always zero) and set cmndf[0]=1
  const startTau = Math.max(1, tauMin);
  const maxTau = Math.min(tauMax, audioSamples.length - 1);
  const df = new Float32Array(maxTau + 1);
  const cmndf = new Float32Array(maxTau + 1);

  // If tauMin > maxTau there are no valid taus to evaluate
  if (startTau > maxTau) return cmndf;

  // Calculate difference function
  for (let tau = 1; tau <= maxTau; tau++) {
    df[tau] = computeDF(audioSamples, tau);
  }

  // Cumulative mean normalized difference function (CMNDF)
  cmndf[0] = 1;

  let cumulativeDF = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    cumulativeDF += df[tau];

    // Protect against division by zero (silence)
    if (cumulativeDF === 0) {
      cmndf[tau] = 1;
    } else {
      cmndf[tau] = (df[tau] * tau) / cumulativeDF;
    }
  }

  return cmndf;
}

/**
 * Compute the difference function (DF) at a given lag tau.
 * THE DF is calculated using the autocorrelation function (ACF).
 *
 * @param {Float32Array} audioSamples - Time-domain audio samples
 * @param {number} tau - Lag in samples (>=0 and < audioSamples.length)
 * @returns {number} Difference function value for the given tau
 */
function computeDF(audioSamples, tau) {
  // First energy term
  const r0 = computeACF(audioSamples, 0);

  // Second energy term (shifted by tau)
  const rShift = computeACF(audioSamples.subarray(tau), 0);

  // ACF at lag tau
  const rTau = computeACF(audioSamples, tau);

  return r0 + rShift - 2 * rTau;
}

/**
 * Compute the autocorrelation function (ACF) at a given lag tau.
 *
 * @param {Float32Array} audioSamples - Time-domain audio samples
 * @param {number} tau - Lag in samples (>=0 and < audioSamples.length)
 * @returns {number} Autocorrelation value for the given tau
 */
function computeACF(audioSamples, tau) {
  // If the requested tau is outside the valid range we return 0.
  const maxTau = audioSamples.length - 1;
  if (tau < 0 || tau > maxTau) return 0;

  let acf = 0;
  const limit = audioSamples.length - tau;
  for (let x = 0; x < limit; x++) {
    acf += audioSamples[x] * audioSamples[x + tau];
  }
  return acf;
}

/**
 * Step 4 — Absolute Threshold.
 * Finds the first tau whose CMNDF value drops below the
 * threshold and returns the bottom of that valley.
 * Falls back to the global minimum if no crossing is found.
 * @param {Float32Array} cmndf - Normalized difference array (CMNDF)
 * @param {number} threshold - Confidence threshold (0-1)
 * @param {number} tauMin - Minimum tau in samples
 * @param {number} tauMax - Maximum tau in samples
 * @returns {number} Best tau candidate in samples
 */
function findBestTau(cmndf, threshold, tauMin, tauMax) {
  for (let tau = tauMin; tau < tauMax; tau++) {
    if (cmndf[tau] < threshold) {
      // Initial tau below threshold may not be the valley bottom.
      // Advance until CMNDF stops decreasing.
      let bestTauCandidate = tau;
      while (
        bestTauCandidate + 1 < tauMax &&
        cmndf[bestTauCandidate + 1] < cmndf[bestTauCandidate]
      ) {
        bestTauCandidate++;
      }
      return bestTauCandidate;
    }
  }

  // If no point below threshold, find global minimum in range
  return findGlobalMinIndex(cmndf, tauMin, tauMax);
}

/**
 * Locate the index of the minimum value within a slice of an array.
 *
 * This is a simple linear search over the half-open range `[start, end)`.
 *
 * @param {Float32Array} array - numeric array to inspect
 * @param {number} start - inclusive start index of the search range
 * @param {number} end - exclusive end index of the search range
 * @returns {number} index of the lowest-valued element; if `start === end`
 *          behaviour is undefined (caller should avoid empty ranges)
 */
function findGlobalMinIndex(array, start, end) {
  let minValue = array[start];
  let minIndex = start;
  for (let i = start + 1; i < end; i++) {
    if (array[i] < minValue) {
      minValue = array[i];
      minIndex = i;
    }
  }
  return minIndex;
}

/**
 * Step 5 — Parabolic Interpolation.
 * Refines the integer tau estimate to sub-sample precision
 * by fitting a parabola through the three CMNDF values
 * around the best tau, yielding a more accurate (possibly fractional) lag.
 *
 * Because the points lie at tau−1, tau, and tau+1 the general vertex formula
 * simplifies to the compact symmetric expression used below.
 *
 * @param {Float32Array} cmndf - Normalized difference array (CMNDF)
 * @param {number} tau - Best tau candidate in samples
 * @returns {number} interpolated tau (may be fractional) in samples
 */
function refineTau(cmndf, tau) {
  // Can't interpolate at boundaries — return the integer value
  if (tau < 1 || tau + 1 >= cmndf.length) {
    return tau;
  }

  // equally spaced neighbours (tau-1, tau, tau+1) --> simple vertex offset
  const numerator = cmndf[tau - 1] - cmndf[tau + 1];
  const denominator = cmndf[tau - 1] - 2 * cmndf[tau] + cmndf[tau + 1];

  // Parabolic interpolation
  return tau + 0.5 * (numerator / denominator);
}
