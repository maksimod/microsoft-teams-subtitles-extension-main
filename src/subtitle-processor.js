// Subtitle processing module
import Config from './config.js';
import { debugLog, getSpeakerId, isContinuationOfSpeech, debounce } from './utils.js';
import { 
  translateText, 
  throttledTranslate,
  clearActiveTimerForSpeaker, 
  setActiveTimerForSpeaker 
} from './translation-service.js';
import { updateTranslationsDisplay } from './popup-manager.js';
import { updateDisplay as updateInlineDisplay } from './direct-content-display.js';

// Speech detection variables
const activeSpeakers = {}; // Map of active speakers and their current utterances
const knownSubtitles = new Set(); // Set of known subtitle texts to avoid duplicates
const translatedUtterances = {}; // Map of speaker ID to their latest utterance
let isClearing = false; // Flag to prevent clearing and adding simultaneously
let lastProcessedTime = 0; // Track when we last processed subtitles

// Speaker identification cache
const speakerNameCache = {}; // Cache speaker names by DOM elements
const lastFullTextBySpeaker = {}; // Track last complete text by speaker to avoid duplicates

// Timers for delaying translations
const translationTimers = {};

// Minimum length for translation
const MIN_LENGTH_FOR_TRANSLATION = 2;

// Reasonable translation update interval - not too frequent
const TRANSLATION_UPDATE_INTERVAL = 800; // Slightly faster than default 1000ms

/**
 * Reset known subtitles to avoid processing past items
 */
function resetKnownSubtitles() {
  knownSubtitles.clear();
  
  // Use forEach to clear last texts
  Object.keys(lastFullTextBySpeaker).forEach(key => {
    delete lastFullTextBySpeaker[key];
  });
  
  debugLog("Known subtitles reset");
}

/**
 * Enhanced speaker detection from Teams UI
 * @returns {Object} Speaker information with name and possible avatar URL
 */
function detectSpeaker() {
  try {
    let speakerName = "Unknown";
    let speakerAvatar = null;
    
    // Try multiple selectors to find the speaker with prioritization
    const speakerSelectors = [
      // Primary Teams caption selector
      '[data-tid="closed-caption-activity-name"]',
      // Alternative selector for newer versions
      '.ts-captions-container .ts-captions-speaker',
      // Fallback for other versions
      '[aria-label*="caption"] .caption-speaker',
      '.caption-container .caption-speaker',
      // Latest Teams version selectors
      '[data-tid="meetup-captions-container"] [data-tid="caption-speaker"]',
      '[data-tid="meetup-captions-container"] [class*="speaker"]',
      // Extremely generic fallback - last resort
      '[class*="caption"] [class*="speaker"]'
    ];
    
    // Try each selector
    for (const selector of speakerSelectors) {
      const speakerElements = document.querySelectorAll(selector);
      for (const speakerElement of speakerElements) {
        if (speakerElement && speakerElement.innerText && speakerElement.innerText.trim()) {
          speakerName = speakerElement.innerText.trim();
          
          // If we found a name, check if this element has an associated avatar
          const nearbyAvatar = speakerElement.closest('[data-tid], [class*="avatar"], [class*="participant"]')?.querySelector('img');
          if (nearbyAvatar?.src) {
            speakerAvatar = nearbyAvatar.src;
          }
          
          // Break early if we found a name
          break;
        }
      }
      
      // Break early if we found a name
      if (speakerName !== "Unknown") break;
    }
    
    // Only search for avatar if we still don't have one
    if (!speakerAvatar) {
      // Try to find avatar (profile picture)
      const avatarSelectors = [
        // Various possible selectors for avatar images
        '[data-tid="closed-caption-activity-avatar"] img',
        '.ts-captions-container .ts-captions-avatar img',
        '[class*="avatar-image"]',
        '.call-participant-avatar img',
        '[data-tid*="avatar"] img',
        '[class*="participant"] [class*="avatar"] img'
      ];
      
      for (const selector of avatarSelectors) {
        const avatarElements = document.querySelectorAll(selector);
        for (const avatarElement of avatarElements) {
          if (avatarElement && avatarElement.src) {
            speakerAvatar = avatarElement.src;
            break;
          }
        }
        if (speakerAvatar) break;
      }
    }
    
    // If we still don't have a speaker name, try looking at data attributes
    if (speakerName === "Unknown") {
      const possibleElements = document.querySelectorAll('[aria-label*="is speaking"], [data-tid*="participant"], [class*="participant"]');
      
      for (const el of possibleElements) {
        // Check aria-label like "John Doe is speaking"
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel && ariaLabel.includes('speaking')) {
          const match = ariaLabel.match(/(.*?)\s+is speaking/i);
          if (match && match[1]) {
            speakerName = match[1].trim();
            
            // If we found a name, check for an avatar
            const avatarImg = el.querySelector('img');
            if (avatarImg?.src) {
              speakerAvatar = avatarImg.src;
            }
            
            break;
          }
        }
        
        // Check data attributes that might contain speaker info
        const dataTid = el.getAttribute('data-tid');
        if (dataTid && dataTid.includes('participant')) {
          // The element itself might have the name or a child element might
          if (el.innerText && el.innerText.trim()) {
            speakerName = el.innerText.trim();
            
            // Check for avatar
            const avatarImg = el.querySelector('img');
            if (avatarImg?.src) {
              speakerAvatar = avatarImg.src;
            }
            
            break;
          }
          
          // Check for name in children
          const nameEl = el.querySelector('[data-tid*="name"], [class*="name"]');
          if (nameEl && nameEl.innerText.trim()) {
            speakerName = nameEl.innerText.trim();
            
            // Check for avatar
            const avatarImg = el.querySelector('img') || nameEl.closest('[data-tid], [class*="participant"]')?.querySelector('img');
            if (avatarImg?.src) {
              speakerAvatar = avatarImg.src;
            }
            
            break;
          }
        }
      }
    }
    
    // Clean up speaker name (remove role indicators)
    speakerName = speakerName
      .replace(/\(organizer\)/i, '')
      .replace(/\(presenter\)/i, '')
      .replace(/\(attendee\)/i, '')
      .replace(/\(guest\)/i, '')
      .replace(/\(you\)/i, '')
      .trim();
    
    return { name: speakerName, avatar: speakerAvatar };
  } catch (error) {
    console.error("Error detecting speaker:", error);
    debugLog(`Speaker detection error: ${error.message}`);
    return { name: "Unknown", avatar: null };
  }
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
  if (now - lastProcessedTime < Config.DEBOUNCE_DELAY / 2) {
    return;
  }
  lastProcessedTime = now;

  // Select all subtitle containers - try multiple selectors to be more robust
  const subtitleSelectors = [
    'span[dir="auto"][data-tid="closed-caption-text"]',
    '.ts-captions-container .ts-captions-text',
    '.caption-text',
    '[data-tid="meetup-captions-container"] [data-tid="caption-text"]',
    '[class*="caption"] [class*="text"]'
  ];
  
  let subtitleContainers = [];
  for (const selector of subtitleSelectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      subtitleContainers = Array.from(elements);
      break;
    }
  }

  if (subtitleContainers.length === 0) {
    return;
  }

  try {
    // Use a map to collect unique text by speaker
    const currentTexts = new Map();
    
    // Detect current speaker first
    const { name: speakerName, avatar: speakerAvatar } = detectSpeaker();
    const speakerId = getSpeakerId(speakerName);
    
    // Process each subtitle container
    for (const subtitleContainer of subtitleContainers) {
      const text = subtitleContainer.innerText.trim();
      
      // Skip if the text is empty or already processed recently
      if (!text || knownSubtitles.has(text)) {
        continue;
      }
      
      // Add to the current texts map
      currentTexts.set(speakerId, {
        text,
        speakerName,
        speakerAvatar
      });
      
      // Add to known subtitles set to avoid duplicates
      knownSubtitles.add(text);
    }
    
    // Now process each unique speaker's text
    for (const [speakerId, data] of currentTexts.entries()) {
      const { text, speakerName, speakerAvatar } = data;
      
      // Skip if this text is identical to the last complete utterance for this speaker
      if (lastFullTextBySpeaker[speakerId] === text) {
        continue;
      }
      
      debugLog(`Detected subtitle from ${speakerName}: "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}"`);
      
      // Check if this is a continued speech or a new one
      if (activeSpeakers[speakerId]) {
        // Update the time of the last segment
        activeSpeakers[speakerId].lastTime = now;
        
        const hasContentChanged = activeSpeakers[speakerId].fullText !== text;
        
        // Update the full text - use the newest, most complete text
        if (text.length > activeSpeakers[speakerId].fullText.length || hasContentChanged) {
          activeSpeakers[speakerId].fullText = text;
          lastFullTextBySpeaker[speakerId] = text;
          
          // Also update avatar if available
          if (speakerAvatar && !activeSpeakers[speakerId].avatar) {
            activeSpeakers[speakerId].avatar = speakerAvatar;
          }
          
          // If content changed, force UI update to show "Translating..." initially
          if (hasContentChanged) {
            updateTranslationsDisplay(translatedUtterances, activeSpeakers);
            updateInlineDisplay(translatedUtterances, activeSpeakers);
          }
        }
        
        // Reset the finalization timer
        clearActiveTimerForSpeaker(speakerId, 'finalize');
        
        // Set a new finalization timer
        setActiveTimerForSpeaker(speakerId, 'finalize', setTimeout(() => {
          finalizeSpeech(speakerId, inputLang, outputLang);
        }, Config.SPEECH_SEGMENT_TIMEOUT));
        
        // Schedule translation with delay
        scheduleTranslation(speakerId, inputLang, outputLang);
      } else {
        // This is a new speech
        activeSpeakers[speakerId] = {
          speaker: speakerName,
          fullText: text,
          lastTime: now,
          translatedText: "Translating...",
          utteranceId: now.toString(),
          active: true,
          avatar: speakerAvatar
        };
        
        lastFullTextBySpeaker[speakerId] = text;
        
        // Set a finalization timer
        setActiveTimerForSpeaker(speakerId, 'finalize', setTimeout(() => {
          finalizeSpeech(speakerId, inputLang, outputLang);
        }, Config.SPEECH_SEGMENT_TIMEOUT));
        
        // Schedule translation with delay
        scheduleTranslation(speakerId, inputLang, outputLang);
        
        // Immediately update display to show "Translating..." for this new speaker
        updateTranslationsDisplay(translatedUtterances, activeSpeakers);
        updateInlineDisplay(translatedUtterances, activeSpeakers);
      }
    }
    
    // Update the display if we processed anything
    if (currentTexts.size > 0) {
      forceDisplayUpdate();
    }
  } catch (error) {
    console.error("Error processing subtitles:", error);
    debugLog(`Subtitle processing error: ${error.message}`);
  }
}

/**
 * Force update displays
 */
function forceDisplayUpdate() {
  // Update both display types
  updateTranslationsDisplay(translatedUtterances, activeSpeakers);
  updateInlineDisplay(translatedUtterances, activeSpeakers);
}

// Expose for use by translation service
window.forceDisplayUpdate = forceDisplayUpdate;

/**
 * Schedule translation with delay
 * @param {string} speakerId - Speaker ID
 * @param {string} inputLang - Source language
 * @param {string} outputLang - Target language
 */
function scheduleTranslation(speakerId, inputLang, outputLang) {
  // Cancel previous scheduled translation
  if (translationTimers[speakerId]) {
    clearTimeout(translationTimers[speakerId]);
  }
  
  // For immediate UI feedback, set a placeholder if there's no translation yet
  if (activeSpeakers[speakerId] && 
      (!activeSpeakers[speakerId].translatedText || 
       activeSpeakers[speakerId].translatedText === "..." ||
       activeSpeakers[speakerId].translatedText === "Translating...")) {
    activeSpeakers[speakerId].translatedText = "Translating...";
    // Update display to show the "Translating..." message
    forceDisplayUpdate();
  }
  
  // Schedule new translation immediately for first translation
  const initialDelay = activeSpeakers[speakerId] && activeSpeakers[speakerId].translatedText === "Translating..." ? 
    0 : TRANSLATION_UPDATE_INTERVAL;
  
  translationTimers[speakerId] = setTimeout(() => {
    if (activeSpeakers[speakerId]?.fullText.length > 20) {
      // Use throttled translate for longer text to improve performance
      throttledTranslate(speakerId, activeSpeakers[speakerId].fullText, inputLang, outputLang)
        .then((result) => {
          if (result && activeSpeakers[speakerId]) {
            activeSpeakers[speakerId].translatedText = result;
            forceDisplayUpdate();
          }
        })
        .catch((error) => {
          console.error("Translation error:", error);
        });
    } else {
      // Use standard translate for short text
      translateAndUpdateUtterance(speakerId, inputLang, outputLang);
    }
    delete translationTimers[speakerId];
  }, initialDelay);
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
    forceDisplayUpdate();
    return;
  }
  
  debugLog(`Translating for ${speakerId}: ${textToTranslate.substring(0, 40)}...`);
  
  try {
    // Translate the text
    const translatedText = await translateText(speakerId, textToTranslate, inputLang, outputLang);
    
    // If this speaker is still active
    if (activeSpeakers[speakerId]) {
      // Set the translated text - even if partial or incomplete
      if (translatedText && translatedText !== activeSpeakers[speakerId].translatedText) {
        activeSpeakers[speakerId].translatedText = translatedText;
        
        // Log the translation
        debugLog(`Translation update: ${(translatedText || "").substring(0, 40)}...`);
        
        // Update our map of translated utterances with current (possibly partial) translation
        updateTranslatedUtterancesMap(speakerId, {
          id: activeSpeakers[speakerId].utteranceId,
          speaker: activeSpeakers[speakerId].speaker,
          speakerId: speakerId,
          original: activeSpeakers[speakerId].fullText,
          translated: translatedText,
          timestamp: new Date().toLocaleTimeString(),
          active: true,
          avatar: activeSpeakers[speakerId].avatar
        });
        
        // Force update of both display types
        forceDisplayUpdate();
        
        // If still active and text has changed, schedule another translation soon
        if (activeSpeakers[speakerId].active && textToTranslate.length > 20) {
          translationTimers[speakerId] = setTimeout(() => {
            translateAndUpdateUtterance(speakerId, inputLang, outputLang);
            delete translationTimers[speakerId];
          }, TRANSLATION_UPDATE_INTERVAL);
        }
      }
    }
  } catch (error) {
    console.error("Error in translateAndUpdateUtterance:", error);
    // If translation failed, don't stop trying - schedule another attempt
    if (activeSpeakers[speakerId] && activeSpeakers[speakerId].active) {
      translationTimers[speakerId] = setTimeout(() => {
        translateAndUpdateUtterance(speakerId, inputLang, outputLang);
        delete translationTimers[speakerId];
      }, TRANSLATION_UPDATE_INTERVAL);
    }
  }
}

/**
 * Update the map of translated utterances
 * @param {string} speakerId - Speaker ID
 * @param {object} utterance - Utterance object
 */
function updateTranslatedUtterancesMap(speakerId, utterance) {
  // Just replace the current utterance for this speaker
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
    try {
      const translatedText = await translateText(speakerId, utterance.fullText, inputLang, outputLang);
      if (translatedText) {
        utterance.translatedText = translatedText;
      } else {
        utterance.translatedText = "[Translation unavailable]";
      }
    } catch (error) {
      console.error("Finalization translation error:", error);
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
      active: false,
      avatar: utterance.avatar
    };
    
    // Update our map of translated utterances
    updateTranslatedUtterancesMap(speakerId, finalUtterance);
    
    // Log the complete translation
    debugLog(`Finalized speech from ${utterance.speaker}: "${utterance.translatedText?.substring(0, 40) || 'n/a'}..."`);
  }
  
  // Create new utterance ID for next time this speaker talks
  const newId = Date.now().toString();
  
  // Create a new object for future utterances from this speaker
  // This allows multiple utterances from the same speaker to be accumulated
  const speakerInfo = {
    speaker: utterance.speaker,
    fullText: "",
    lastTime: 0,
    translatedText: "",
    utteranceId: newId,
    active: false,
    avatar: utterance.avatar
  };
  
  // Keep the speaker reference with new ID and empty content
  activeSpeakers[speakerId] = speakerInfo;
  
  // Clear any related timers
  clearActiveTimerForSpeaker(speakerId, 'finalize');
  
  // Update the display
  forceDisplayUpdate();
}

/**
 * Clear all subtitle data
 */
function clearSubtitleData() {
  isClearing = true; // Set clearing flag
  
  try {
    // Clear translated utterances map
    Object.keys(translatedUtterances).forEach(key => {
      delete translatedUtterances[key];
    });
    
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
    
    // Clean up lastFullTextBySpeaker 
    Object.keys(lastFullTextBySpeaker).forEach(key => {
      delete lastFullTextBySpeaker[key];
    });
    
    // Update display with empty data
    forceDisplayUpdate();
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
const debounceProcessSubtitles = debounce((isTranslationActive, inputLang, outputLang) => {
  processSubtitles(isTranslationActive, inputLang, outputLang);
}, Config.DEBOUNCE_DELAY);

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