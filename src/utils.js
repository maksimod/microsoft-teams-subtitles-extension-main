// Utility functions
import Config from './config.js';

// Debug logs container with timestamp for easier debugging
const debugLogs = [];

/**
 * Add a debug log entry with improved formatting
 * @param {string} message - Log message
 */
function debugLog(message) {
  const now = new Date();
  const timestamp = now.toISOString().substr(11, 12); // Include milliseconds
  const logEntry = `${timestamp}: ${message}`;
  
  // Add to beginning for more recent logs at the top
  debugLogs.unshift(logEntry);
  
  // Keep log size manageable
  if (debugLogs.length > Config.MAX_DEBUG_LOGS) {
    debugLogs.pop(); // Remove oldest entry
  }
  
  // Log to console only in development mode
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Translator] ${logEntry}`);
  }
  
  // If there's a function to update popup logs, call it
  if (typeof window.updateDebugLogs === 'function') {
    try {
      window.updateDebugLogs();
    } catch (e) {
      // Ignore errors when updating debug logs
    }
  }
}

/**
 * Generate a unique ID for a speaker with improved consistency
 * @param {string} speakerName - The name of the speaker
 * @returns {string} - A unique ID
 */
function getSpeakerId(speakerName) {
  if (!speakerName || typeof speakerName !== 'string') {
    return 'speaker_unknown';
  }
  // Replace spaces with underscores and remove special characters
  return `speaker_${speakerName.toLowerCase().trim().replace(/[^a-z0-9]/gi, '_')}`;
}

/**
 * Check if a text is likely a continuation of current speech
 * Improved detection algorithm with more heuristics
 * @param {object} activeSpeakers - Map of active speakers
 * @param {string} speaker - Speaker ID
 * @param {string} text - New text segment
 * @returns {boolean} - True if it's likely a continuation
 */
function isContinuationOfSpeech(activeSpeakers, speaker, text) {
  // If there's no active speech for this speaker, it's not a continuation
  if (!activeSpeakers[speaker] || !activeSpeakers[speaker].fullText) {
    return false;
  }
  
  // If too much time has passed, it's not a continuation
  const timeSinceLastSegment = Date.now() - activeSpeakers[speaker].lastTime;
  if (timeSinceLastSegment > Config.SPEECH_SEGMENT_TIMEOUT) {
    return false;
  }
  
  // Check if new text is contained in the previous text
  // This handles the case where Teams updates the entire text, not just appends
  const previousText = activeSpeakers[speaker].fullText;
  if (previousText.includes(text) || text.includes(previousText)) {
    return true;
  }
  
  // Check if new text starts with the previous text
  // This handles the case where Teams appends to existing text
  if (text.startsWith(previousText)) {
    return true;
  }
  
  // Check if Levenshtein distance is small compared to the length
  // This handles the case where there are small edits/corrections
  const distance = levenshteinDistance(previousText, text);
  const maxLength = Math.max(previousText.length, text.length);
  if (distance / maxLength < 0.3) { // If less than 30% different
    return true;
  }
  
  return false;
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} - The Levenshtein distance
 */
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Debounce function to limit function call frequency
 * @param {Function} func - The function to debounce
 * @param {number} wait - The time to wait in milliseconds
 * @returns {Function} - The debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

/**
 * Throttle function to limit function call frequency
 * @param {Function} func - The function to throttle
 * @param {number} limit - The time limit in milliseconds
 * @returns {Function} - The throttled function
 */
function throttle(func, limit) {
  let lastCall = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      return func.apply(this, args);
    }
  };
}

// Export all debugLogs for access from other modules
function getDebugLogs() {
  return [...debugLogs]; // Return a copy to prevent external modification
}

// Clear debug logs
function clearDebugLogs() {
  debugLogs.length = 0;
}


// Экспортируйте эти функции, если их ещё нет в вашем utils.js
export {
  debugLog,
  getSpeakerId,
  isContinuationOfSpeech,
  getDebugLogs,
  clearDebugLogs,
  debounce,  // Новая функция
  throttle   // Новая функция
};