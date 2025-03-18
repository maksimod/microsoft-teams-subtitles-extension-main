// Translation service
import Config from './config.js';
import { debugLog } from './utils.js';

// Keep track of translation requests and throttling
let lastTranslationRequestTime = {};
let pendingTranslations = {};
let activeTimers = {};
let translationRetryCount = {}; // Retry counter
let translationCache = new Map(); // Cache for translations to avoid duplicate requests

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
  if (text.length < 2) return text;
  
  // Create cache key
  const cacheKey = `${inputLang}:${outputLang}:${text}`;
  
  // Check cache first
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }
  
  // Check if we need to throttle this translation request
  const now = Date.now();
  if (lastTranslationRequestTime[speakerId] && 
      now - lastTranslationRequestTime[speakerId] < Config.TRANSLATION_THROTTLE) {
    // If there's already a pending translation for this speaker, replace it
    if (pendingTranslations[speakerId]) {
      pendingTranslations[speakerId].text = text;
      debugLog(`Throttled translation request for ${speakerId}, queued for later`);
      return null; // Translation will happen later
    }
    
    // Schedule a translation for later
    const timeToWait = Config.TRANSLATION_THROTTLE - (now - lastTranslationRequestTime[speakerId]);
    
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
    return null;
  }
  
  // Update the last translation request time
  lastTranslationRequestTime[speakerId] = now;
  
  // Initialize retry count for this speaker if it doesn't exist
  if (!translationRetryCount[speakerId]) {
    translationRetryCount[speakerId] = 0;
  }
  
  try {
    debugLog(`Translating for ${speakerId}: ${text.substring(0, 40)}...`);
    
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
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
        
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
    if (!data || !data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
      throw new Error("Invalid response structure from API");
    }
    
    const translatedText = data.choices[0].message.content.trim();
    
    // Add to cache
    translationCache.set(cacheKey, translatedText);
    
    // Limit cache size to avoid memory leaks
    if (translationCache.size > 500) {
      // Delete oldest entries (first 100)
      const keysToDelete = Array.from(translationCache.keys()).slice(0, 100);
      keysToDelete.forEach(key => translationCache.delete(key));
    }
    
    // Reset retry count on successful translation
    translationRetryCount[speakerId] = 0;
    
    debugLog(`Translation complete: ${translatedText.substring(0, 40)}...`);
    return translatedText;
  } catch (error) {
    console.error("Translation error:", error);
    debugLog(`Translation error: ${error.message}`);
    
    // Increment retry count
    translationRetryCount[speakerId]++;
    
    // If we've tried too many times, just return a fallback message
    if (translationRetryCount[speakerId] > 3) {
      return "[Translation unavailable]";
    }
    
    // For the first few errors, return a temporary message but don't retry automatically
    return "Translating..."; // Return a temporary message
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
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
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
  lastTranslationRequestTime = {};
  pendingTranslations = {};
  translationRetryCount = {}; // Reset retry counts too
  
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
  checkApiConnection,
  clearTranslationTimers,
  getActiveTimerForSpeaker,
  setActiveTimerForSpeaker,
  clearActiveTimerForSpeaker
};