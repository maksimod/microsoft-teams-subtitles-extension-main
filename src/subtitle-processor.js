// Subtitle processing module
import Config from './config.js';
import { debugLog, getSpeakerId, isContinuationOfSpeech } from './utils.js';
import { 
  translateText, 
  clearActiveTimerForSpeaker, 
  setActiveTimerForSpeaker 
} from './translation-service.js';
import { updateTranslationsDisplay } from './popup-manager.js';

// Speech detection variables
let allCapturedText = []; // Array of all text segments in this session
let activeSpeakers = {}; // Map of active speakers and their current utterances
let knownSubtitles = new Set(); // Set of known subtitle texts to avoid duplicates
let translatedUtterances = []; // Fully translated utterances
let isClearing = false; // Flag to prevent clearing and adding simultaneously

/**
 * Process subtitles found in the DOM
 * @param {boolean} isTranslationActive - Whether translation is active
 * @param {string} inputLang - Input language
 * @param {string} outputLang - Output language
 */
function processSubtitles(isTranslationActive, inputLang, outputLang) {
  if (!isTranslationActive || isClearing) {
    return;
  }

  // Select all subtitle containers
  const subtitleContainers = document.querySelectorAll(
    'span[dir="auto"][data-tid="closed-caption-text"]'
  );

  if (subtitleContainers.length === 0) {
    return;
  }

  try {
    // Process each subtitle container
    for (const subtitleContainer of subtitleContainers) {
      const text = subtitleContainer.innerText.trim();
      
      // Skip if the text is empty or already processed
      if (!text || knownSubtitles.has(text)) {
        continue;
      }
      
      // Add to known subtitles set
      knownSubtitles.add(text);
      
      // Add to all captured text
      allCapturedText.push(text);
      
      // Try to detect the current speaker
      let speakerElement = null;
      let speakerName = "Unknown";
      
      try {
        // Look for speaker name in various possible elements
        speakerElement = document.querySelector('[data-tid="closed-caption-activity-name"]');
        if (speakerElement) {
          speakerName = speakerElement.innerText.trim() || "Unknown";
        }
      } catch (error) {
        console.error("Error detecting speaker:", error);
      }
      
      const speakerId = getSpeakerId(speakerName);
      
      debugLog(`Detected subtitle from ${speakerName}: "${text}"`);
      
      // Check if this is a continued speech or a new one
      if (activeSpeakers[speakerId] && isContinuationOfSpeech(activeSpeakers, speakerId, text)) {
        // Continuation of current speech
        // Update the time of the last segment
        activeSpeakers[speakerId].lastTime = Date.now();
        
        // Add this segment to the segments array
        activeSpeakers[speakerId].segments.push(text);
        
        // Reset the finalization timer
        clearActiveTimerForSpeaker(speakerId, 'finalize');
        
        // Set a new finalization timer
        setActiveTimerForSpeaker(speakerId, 'finalize', setTimeout(() => {
          finalizeSpeech(speakerId, inputLang, outputLang);
        }, Config.SPEECH_SEGMENT_TIMEOUT));
        
        // Update the full text
        activeSpeakers[speakerId].fullText = activeSpeakers[speakerId].segments.join(' ');
        
        // Translate the updated text
        translateAndUpdateUtterance(speakerId, inputLang, outputLang);
      } else {
        // This is a new speech or from a different speaker
        
        // If there was an active speech from this speaker, finalize it
        if (activeSpeakers[speakerId]) {
          finalizeSpeech(speakerId, inputLang, outputLang);
        }
        
        // Create a new active speech entry
        activeSpeakers[speakerId] = {
          speaker: speakerName,
          segments: [text],
          fullText: text,
          lastTime: Date.now(),
          translatedText: "Translating...", // Initialize with a message rather than null
          utteranceId: Date.now().toString(),
          active: true
        };
        
        // Set a finalization timer
        setActiveTimerForSpeaker(speakerId, 'finalize', setTimeout(() => {
          finalizeSpeech(speakerId, inputLang, outputLang);
        }, Config.SPEECH_SEGMENT_TIMEOUT));
        
        // Start translation for this new segment
        translateAndUpdateUtterance(speakerId, inputLang, outputLang);
      }
      
      // Update the display
      updateTranslationsDisplay(translatedUtterances, activeSpeakers);
    }
  } catch (error) {
    console.error("Error processing subtitles:", error);
    debugLog(`Subtitle processing error: ${error.message}`);
  }
}

/**
 * Translate and update an active utterance
 * @param {string} speakerId - ID of the speaker
 * @param {string} inputLang - Input language
 * @param {string} outputLang - Output language
 */
async function translateAndUpdateUtterance(speakerId, inputLang, outputLang) {
  if (!activeSpeakers[speakerId]) return;
  
  const utterance = activeSpeakers[speakerId];
  const textToTranslate = utterance.fullText;
  
  // If this is a very short text, don't bother translating yet
  if (textToTranslate.length < 3) {
    utterance.translatedText = "...";
    updateTranslationsDisplay(translatedUtterances, activeSpeakers);
    return;
  }
  
  // Translate the text
  const translatedText = await translateText(speakerId, textToTranslate, inputLang, outputLang);
  
  // If translation was throttled, it will return null and be handled later
  if (translatedText === null) return;
  
  // If this speaker is still active and this is still the current utterance
  if (activeSpeakers[speakerId] && activeSpeakers[speakerId].utteranceId === utterance.utteranceId) {
    activeSpeakers[speakerId].translatedText = translatedText;
    updateTranslationsDisplay(translatedUtterances, activeSpeakers);
  }
}

/**
 * Finalize a speech (mark it as complete)
 * @param {string} speakerId - ID of the speaker
 * @param {string} inputLang - Input language
 * @param {string} outputLang - Output language
 */
async function finalizeSpeech(speakerId, inputLang, outputLang) {
  if (!activeSpeakers[speakerId]) return;
  
  // Get the final active utterance
  const utterance = activeSpeakers[speakerId];
  
  // If we haven't translated it yet or the translation failed, try once more
  if (!utterance.translatedText || utterance.translatedText === "..." || utterance.translatedText === "Translating...") {
    const translatedText = await translateText(speakerId, utterance.fullText, inputLang, outputLang);
    if (translatedText) {
      utterance.translatedText = translatedText;
    } else {
      utterance.translatedText = "[Translation unavailable]";
    }
  }
  
  // Only add to finalized utterances if we're not currently clearing
  if (!isClearing) {
    // Add the finalized utterance to our list
    translatedUtterances.push({
      id: utterance.utteranceId,
      speaker: utterance.speaker,
      speakerId: speakerId,
      original: utterance.fullText,
      translated: utterance.translatedText,
      timestamp: new Date().toLocaleTimeString(),
      segments: [...utterance.segments]
    });
  }
  
  // Mark it as inactive
  utterance.active = false;
  
  // Clear the active speaker entry
  delete activeSpeakers[speakerId];
  
  // Clear any related timers
  clearActiveTimerForSpeaker(speakerId, 'finalize');
  
  debugLog(`Finalized speech from ${utterance.speaker}: "${utterance.fullText.substring(0, 40)}..."`);
  
  // Update the display
  updateTranslationsDisplay(translatedUtterances, activeSpeakers);
}

/**
 * Clear all subtitle data
 */
function clearSubtitleData() {
  isClearing = true; // Set clearing flag
  
  try {
    // Clear data structures
    translatedUtterances = [];
    
    // Finalize any active speakers
    const activeIds = Object.keys(activeSpeakers);
    for (const speakerId of activeIds) {
      clearActiveTimerForSpeaker(speakerId, 'finalize');
      delete activeSpeakers[speakerId];
    }
    
    // Clear other data structures
    knownSubtitles.clear();
    allCapturedText = [];
    
    // Update display with empty data
    updateTranslationsDisplay([], {});
  } finally {
    // Always reset the clearing flag
    setTimeout(() => {
      isClearing = false;
    }, 500); // Short delay to prevent race conditions
  }
}

/**
 * Get active speakers
 * @returns {Object} - Map of active speakers
 */
function getActiveSpeakers() {
  return activeSpeakers;
}

/**
 * Get translated utterances
 * @returns {Array} - Array of translated utterances
 */
function getTranslatedUtterances() {
  return translatedUtterances;
}

// Create a debounced version of processSubtitles
let debounceTimer;
function debounceProcessSubtitles(isTranslationActive, inputLang, outputLang) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    processSubtitles(isTranslationActive, inputLang, outputLang);
  }, Config.DEBOUNCE_DELAY);
}

// Expose getActiveSpeakers globally so it can be used by translation service
window.getActiveSpeakers = getActiveSpeakers;

export {
  processSubtitles,
  debounceProcessSubtitles,
  clearSubtitleData,
  getActiveSpeakers,
  getTranslatedUtterances
};