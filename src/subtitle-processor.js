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
let activeSpeakers = {}; // Map of active speakers and their current utterances
let knownSubtitles = new Set(); // Set of known subtitle texts to avoid duplicates
let translatedUtterances = {}; // Map of speaker ID to their latest utterance
let isClearing = false; // Flag to prevent clearing and adding simultaneously
let lastProcessedTime = 0; // Track when we last processed subtitles

// Таймеры для откладывания переводов
let translationTimers = {};

// Минимальная длина для перевода
const MIN_LENGTH_FOR_TRANSLATION = 2;

/**
 * Reset known subtitles to avoid processing past items
 */
function resetKnownSubtitles() {
  knownSubtitles.clear();
  debugLog("Known subtitles reset");
}

/**
 * Process subtitles found in the DOM
 * @param {boolean} isTranslationActive - Whether translation is active
 * @param {string} inputLang - Input language
 * @param {string} outputLang - Output language
 */
function processSubtitles(isTranslationActive, inputLang, outputLang) {
  // Skip processing if translation is inactive or we're currently clearing
  if (!isTranslationActive || isClearing) {
    return;
  }
  
  // Rate limit processing to avoid performance issues
  const now = Date.now();
  if (now - lastProcessedTime < Config.DEBOUNCE_DELAY) {
    return;
  }
  lastProcessedTime = now;

  // Select all subtitle containers
  const subtitleContainers = document.querySelectorAll(
    'span[dir="auto"][data-tid="closed-caption-text"]'
  );

  if (subtitleContainers.length === 0) {
    return;
  }

  try {
    // Use a map to collect unique text by speaker
    const currentTexts = new Map();
    
    // Process each subtitle container
    for (const subtitleContainer of subtitleContainers) {
      const text = subtitleContainer.innerText.trim();
      
      // Skip if the text is empty or already processed recently
      if (!text || knownSubtitles.has(text)) {
        continue;
      }
      
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
      
      // Add to the current texts map
      currentTexts.set(speakerId, {
        text,
        speakerName
      });
      
      // Add to known subtitles set to avoid duplicates
      knownSubtitles.add(text);
    }
    
    // Now process each unique speaker's text
    for (const [speakerId, data] of currentTexts.entries()) {
      const { text, speakerName } = data;
      
      debugLog(`Detected subtitle from ${speakerName}: "${text}"`);
      
      // Check if this is a continued speech or a new one
      if (activeSpeakers[speakerId]) {
        // Update the time of the last segment
        activeSpeakers[speakerId].lastTime = now;
        
        // Update the full text - use the newest, most complete text
        if (text.length > activeSpeakers[speakerId].fullText.length) {
          activeSpeakers[speakerId].fullText = text;
        }
        
        // Reset the finalization timer
        clearActiveTimerForSpeaker(speakerId, 'finalize');
        
        // Set a new finalization timer
        setActiveTimerForSpeaker(speakerId, 'finalize', setTimeout(() => {
          finalizeSpeech(speakerId, inputLang, outputLang);
        }, Config.SPEECH_SEGMENT_TIMEOUT));
        
        // Запланировать перевод с задержкой
        scheduleTranslation(speakerId, inputLang, outputLang);
      } else {
        // This is a new speech
        activeSpeakers[speakerId] = {
          speaker: speakerName,
          fullText: text,
          lastTime: now,
          translatedText: "Translating...",
          utteranceId: now.toString(),
          active: true
        };
        
        // Set a finalization timer
        setActiveTimerForSpeaker(speakerId, 'finalize', setTimeout(() => {
          finalizeSpeech(speakerId, inputLang, outputLang);
        }, Config.SPEECH_SEGMENT_TIMEOUT));
        
        // Запланировать перевод с задержкой
        scheduleTranslation(speakerId, inputLang, outputLang);
      }
    }
    
    // Update the display if we processed anything
    if (currentTexts.size > 0) {
      updateTranslationsDisplay(translatedUtterances, activeSpeakers);
    }
  } catch (error) {
    console.error("Error processing subtitles:", error);
    debugLog(`Subtitle processing error: ${error.message}`);
  }
}

/**
 * Планирует перевод с задержкой
 * @param {string} speakerId - ID говорящего
 * @param {string} inputLang - Исходный язык
 * @param {string} outputLang - Целевой язык
 */
function scheduleTranslation(speakerId, inputLang, outputLang) {
  // Отменяем предыдущий запланированный перевод
  if (translationTimers[speakerId]) {
    clearTimeout(translationTimers[speakerId]);
  }
  
  // Запланировать новый перевод через 500 мс
  translationTimers[speakerId] = setTimeout(() => {
    translateAndUpdateUtterance(speakerId, inputLang, outputLang);
    delete translationTimers[speakerId];
  }, Config.TRANSLATION_THROTTLE);
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
  
  // Skip translating very short text
  if (textToTranslate.length < MIN_LENGTH_FOR_TRANSLATION) {
    utterance.translatedText = "...";
    updateTranslationsDisplay(translatedUtterances, activeSpeakers);
    return;
  }
  
  debugLog(`Translating for ${speakerId}: ${textToTranslate.substring(0, 40)}...`);
  
  // Translate the text
  const translatedText = await translateText(speakerId, textToTranslate, inputLang, outputLang);
  
  // If translation was throttled or failed, it will return null
  if (translatedText === null) return;
  
  // If this speaker is still active
  if (activeSpeakers[speakerId]) {
    // Set the translated text
    activeSpeakers[speakerId].translatedText = translatedText || "Translating...";
    
    // Log the translation
    debugLog(`Translation complete: ${(translatedText || "").substring(0, 40)}...`);
    
    // Update our map of translated utterances
    updateTranslatedUtterancesMap(speakerId, {
      id: activeSpeakers[speakerId].utteranceId,
      speaker: activeSpeakers[speakerId].speaker,
      speakerId: speakerId,
      original: activeSpeakers[speakerId].fullText,
      translated: translatedText,
      timestamp: new Date().toLocaleTimeString(),
      active: true
    });
    
    // Immediately update the display to show progress
    updateTranslationsDisplay(translatedUtterances, activeSpeakers);
  }
}

/**
 * Обновляет карту переведенных высказываний
 * @param {string} speakerId - ID говорящего
 * @param {object} utterance - Объект высказывания
 */
function updateTranslatedUtterancesMap(speakerId, utterance) {
  // Просто заменяем текущее высказывание для данного говорящего
  translatedUtterances[speakerId] = utterance;
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
  
  // Cancel any pending translation
  if (translationTimers[speakerId]) {
    clearTimeout(translationTimers[speakerId]);
    delete translationTimers[speakerId];
  }
  
  // If we haven't translated it yet, try once more
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
    // Create a final utterance object
    const finalUtterance = {
      id: utterance.utteranceId,
      speaker: utterance.speaker,
      speakerId: speakerId,
      original: utterance.fullText,
      translated: utterance.translatedText,
      timestamp: new Date().toLocaleTimeString(),
      active: false
    };
    
    // Update our map of translated utterances
    updateTranslatedUtterancesMap(speakerId, finalUtterance);
    
    // Log the complete translation
    debugLog(`Finalized speech: "${utterance.translatedText?.substring(0, 40) || 'n/a'}..."`);
    debugLog(`Finalized speech from ${utterance.speaker}: "${utterance.fullText.substring(0, 40)}..."`);
  }
  
  // Clear the active speaker entry
  delete activeSpeakers[speakerId];
  
  // Clear any related timers
  clearActiveTimerForSpeaker(speakerId, 'finalize');
  
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
    translatedUtterances = {};
    
    // Finalize any active speakers
    const activeIds = Object.keys(activeSpeakers);
    for (const speakerId of activeIds) {
      clearActiveTimerForSpeaker(speakerId, 'finalize');
      delete activeSpeakers[speakerId];
    }
    
    // Clear translation timers
    for (const speakerId in translationTimers) {
      clearTimeout(translationTimers[speakerId]);
      delete translationTimers[speakerId];
    }
    
    // Clear other data structures
    knownSubtitles.clear();
    
    // Update display with empty data
    updateTranslationsDisplay({}, {});
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
 * @returns {Object} - Map of speaker IDs to their latest utterances
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
  getTranslatedUtterances,
  resetKnownSubtitles
};