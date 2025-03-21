// Translation service
import Config from './config.js';
import { debugLog, throttle } from './utils.js';

// Enhanced caching using LRU mechanism
class LRUCache {
  constructor(maxSize = 500) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.order = [];
  }
  
  has(key) {
    return this.cache.has(key);
  }
  
  get(key) {
    if (!this.cache.has(key)) return null;
    
    // Move to the end of the order for LRU
    const index = this.order.indexOf(key);
    if (index > -1) this.order.splice(index, 1);
    this.order.push(key);
    
    return this.cache.get(key);
  }
  
  set(key, value) {
    // If key exists, update value and move to end
    if (this.cache.has(key)) {
      this.cache.set(key, value);
      const index = this.order.indexOf(key);
      if (index > -1) this.order.splice(index, 1);
      this.order.push(key);
      return;
    }
    
    // Check if we need to remove oldest item
    if (this.order.length >= this.maxSize) {
      const oldestKey = this.order.shift();
      this.cache.delete(oldestKey);
    }
    
    // Add new item
    this.cache.set(key, value);
    this.order.push(key);
  }
  
  clear() {
    this.cache.clear();
    this.order = [];
  }
  
  get size() {
    return this.cache.size;
  }
}

// Keep track of translation requests and throttling
const lastTranslationRequestTime = {};
const pendingTranslations = {};
const activeTimers = {};
const translationRetryCount = {}; // Retry counter
const translationCache = new LRUCache(500); // Enhanced cache for translations
const partialTranslations = {}; // For storing partial translations to be shown in the UI
const translationInProgress = {}; // Track if translation is currently in progress

// Use a reasonable throttling time to avoid API rate limits
const REDUCED_THROTTLE_TIME = 800; // Slightly less than the default 1000ms

/**
 * Translate text using OpenAI API
 * @param {string} speakerId - ID of the speaker
 * @param {string} text - Text to translate
 * @param {string} inputLang - Input language
 * @param {string} outputLang - Output language
 * @returns {Promise<string|null>} - Translated text or null if throttled
 */
async function translateText(speakerId, text, inputLang, outputLang) {
  // Don't translate if the text is too short
  if (!text || text.length < 2) return text;
  
  // Create cache key
  const cacheKey = `${inputLang}:${outputLang}:${text}`;
  
  // Check cache first
  if (translationCache.has(cacheKey)) {
    const cachedTranslation = translationCache.get(cacheKey);
    debugLog(`Using cached translation for: ${text.substring(0, 30)}...`);
    
    // Update active speakers immediately with the cached translation
    updateActiveSpeakerTranslation(speakerId, cachedTranslation);
    
    return cachedTranslation;
  }

  // If there's already a translation in progress for this speaker with the same text,
  // return the current partial translation or "Translating..."
  if (translationInProgress[speakerId] && translationInProgress[speakerId].text === text) {
    return partialTranslations[speakerId] || "Translating...";
  }
  
  // Check if we need to throttle this translation request
  const now = Date.now();
  if (lastTranslationRequestTime[speakerId] && 
      now - lastTranslationRequestTime[speakerId] < REDUCED_THROTTLE_TIME) {
    // If there's already a pending translation for this speaker, replace it
    if (pendingTranslations[speakerId]) {
      pendingTranslations[speakerId].text = text;
      debugLog(`Throttled translation request for ${speakerId}, queued for later`);
      
      // Always update UI with "Translating..." or the last partial translation
      const currentPartial = partialTranslations[speakerId] || "Translating...";
      updateActiveSpeakerTranslation(speakerId, currentPartial);
      
      return currentPartial;
    }
    
    // Schedule a translation for later
    const timeToWait = REDUCED_THROTTLE_TIME - (now - lastTranslationRequestTime[speakerId]);
    
    pendingTranslations[speakerId] = { 
      text,
      inputLang,
      outputLang
    };
    
    activeTimers[`translate_${speakerId}`] = setTimeout(() => {
      const pendingData = pendingTranslations[speakerId];
      if (pendingData) {
        delete pendingTranslations[speakerId];
        translateText(speakerId, pendingData.text, pendingData.inputLang, pendingData.outputLang);
      }
    }, timeToWait);
    
    debugLog(`Queued translation for ${speakerId} in ${timeToWait}ms`);
    
    // Return the last partial translation if we have one, or "Translating..."
    const partialText = partialTranslations[speakerId] || "Translating...";
    updateActiveSpeakerTranslation(speakerId, partialText);
    return partialText;
  }
  
  // Update the last translation request time
  lastTranslationRequestTime[speakerId] = now;
  
  // Initialize retry count for this speaker if it doesn't exist
  if (!translationRetryCount[speakerId]) {
    translationRetryCount[speakerId] = 0;
  }
  
  // Mark this translation as in progress
  translationInProgress[speakerId] = { text };
  
  try {
    debugLog(`Translating for ${speakerId}: ${text.substring(0, 40)}...`);
    
    // Always update UI with "Translating..." as a feedback to the user
    updateActiveSpeakerTranslation(speakerId, partialTranslations[speakerId] || "Translating...");
    
    // Better error handling with retries
    const maxRetries = Config.MAX_RETRIES;
    let response = null;
    let retryAttempt = 0;
    
    while (retryAttempt <= maxRetries) {
      try {
        // Format proper request to API
        const requestBody = {
          model: Config.MODEL_NAME,
          messages: [
            {
              role: "system",
              content: `You are a translation assistant. Translate text from ${inputLang} to ${outputLang} concisely and accurately. Keep the translation direct and maintain the same style and tone.`
            },
            {
              role: "user",
              content: text
            }
          ],
          temperature: 0.3 // Lower temperature for more consistent translations
        };
        
        // Add timeout using AbortController
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 second timeout (reduced from 8s)
        
        try {
          response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Config.OPENAI_API_KEY}`
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          throw fetchError;
        }
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API response error: ${response.status} ${response.statusText}. Details: ${errorText}`);
        }
        
        break; // If we get here, the request was successful
      } catch (retryError) {
        retryAttempt++;
        debugLog(`Translation error (attempt ${retryAttempt}/${maxRetries}): ${retryError.message}`);
        
        if (retryAttempt > maxRetries) {
          throw retryError; // Re-throw if we've exhausted our retries
        }
        
        await new Promise(resolve => setTimeout(resolve, Config.RETRY_DELAY)); // Wait before retrying
      }
    }

    const data = await response.json();
    
    // Verify that the response has the expected structure
    if (!data?.choices?.[0]?.message?.content) {
      throw new Error("Invalid response structure from API");
    }
    
    const translatedText = data.choices[0].message.content.trim();
    
    // Add to cache
    translationCache.set(cacheKey, translatedText);
    
    // Update partial translations for this speaker
    partialTranslations[speakerId] = translatedText;
    
    // Update active speaker with the new translation
    updateActiveSpeakerTranslation(speakerId, translatedText);
    
    // Clear in-progress flag
    delete translationInProgress[speakerId];
    
    // Reset retry count on successful translation
    translationRetryCount[speakerId] = 0;
    
    debugLog(`Translation complete: ${translatedText.substring(0, 40)}...`);
    
    return translatedText;
  } catch (error) {
    console.error("Translation error:", error);
    debugLog(`Translation error: ${error.message}`);
    
    // Clear in-progress flag
    delete translationInProgress[speakerId];
    
    // Increment retry count
    translationRetryCount[speakerId]++;
    
    // If we've tried too many times, just return a fallback message
    if (translationRetryCount[speakerId] > 3) {
      // Store as partial translation
      const errorMsg = "[Translation unavailable]";
      partialTranslations[speakerId] = errorMsg;
      updateActiveSpeakerTranslation(speakerId, errorMsg);
      return errorMsg;
    }
    
    // Return the last partial translation if we have one
    if (partialTranslations[speakerId]) {
      return partialTranslations[speakerId];
    }
    
    // For the first few errors, return a temporary message but don't retry automatically
    const tempMsg = "Translating...";
    updateActiveSpeakerTranslation(speakerId, tempMsg);
    return tempMsg;
  }
}

// Create a throttled version for better performance
const throttledTranslate = throttle(translateText, REDUCED_THROTTLE_TIME);

/**
 * Update the active speaker's translation in real-time
 * @param {string} speakerId - The speaker ID
 * @param {string} translatedText - The translated text
 */
function updateActiveSpeakerTranslation(speakerId, translatedText) {
  // Get active speakers if available in window
  const getActiveSpeakers = window.getActiveSpeakers || function() { return {}; };
  const activeSpeakers = getActiveSpeakers();
  
  // Update translation if speaker is active
  if (activeSpeakers[speakerId] && activeSpeakers[speakerId].active) {
    // Only update if text is different to avoid unnecessary UI updates
    if (activeSpeakers[speakerId].translatedText !== translatedText) {
      activeSpeakers[speakerId].translatedText = translatedText;
      
      // Force UI update by explicitly triggering any available display update function
      if (window.forceDisplayUpdate && typeof window.forceDisplayUpdate === 'function') {
        window.forceDisplayUpdate(activeSpeakers);
      }
    }
  }
}

/**
 * Check API connection by making a simple request
 * @returns {Promise<boolean>} True if API is accessible
 */
async function checkApiConnection() {
  try {
    // Add timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 second timeout (reduced from 5s)
    
    try {
      // Make a simpler request to verify API access
      const response = await fetch("https://api.openai.com/v1/models", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${Config.OPENAI_API_KEY}`
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        debugLog(`API check failed: ${response.status} ${response.statusText}. Details: ${errorText}`);
        return false;
      }
      
      return true;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (error) {
    debugLog(`API check error: ${error.message}`);
    return false;
  }
}

/**
 * Clear all active translation timers
 */
function clearTranslationTimers() {
  // Clear all active timers
  for (const timerId in activeTimers) {
    clearTimeout(activeTimers[timerId]);
    delete activeTimers[timerId];
  }
  
  // Reset translation states
  Object.keys(lastTranslationRequestTime).forEach(key => delete lastTranslationRequestTime[key]);
  Object.keys(pendingTranslations).forEach(key => delete pendingTranslations[key]);
  Object.keys(partialTranslations).forEach(key => delete partialTranslations[key]);
  Object.keys(translationInProgress).forEach(key => delete translationInProgress[key]);
  Object.keys(translationRetryCount).forEach(key => delete translationRetryCount[key]);
  
  // No need to clear translation cache - it can be reused
}

/**
 * Get active timer for a specific speaker
 */
function getActiveTimerForSpeaker(speakerId, type) {
  return activeTimers[`${type}_${speakerId}`];
}

/**
 * Set active timer for a specific speaker
 */
function setActiveTimerForSpeaker(speakerId, type, timer) {
  // Clear existing timer first if it exists
  if (activeTimers[`${type}_${speakerId}`]) {
    clearTimeout(activeTimers[`${type}_${speakerId}`]);
  }
  
  activeTimers[`${type}_${speakerId}`] = timer;
}

/**
 * Clear active timer for a specific speaker
 */
function clearActiveTimerForSpeaker(speakerId, type) {
  if (activeTimers[`${type}_${speakerId}`]) {
    clearTimeout(activeTimers[`${type}_${speakerId}`]);
    delete activeTimers[`${type}_${speakerId}`];
  }
}

export {
  translateText,
  throttledTranslate,
  checkApiConnection,
  clearTranslationTimers,
  getActiveTimerForSpeaker,
  setActiveTimerForSpeaker,
  clearActiveTimerForSpeaker
};