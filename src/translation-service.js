// Translation service
import Config from './config.js';
import { debugLog } from './utils.js';

// Переменные для управления переводами
let activeTimers = {};
let translationRetryCount = {}; // Retry counter
let translationCache = new Map(); // Cache for translations to avoid duplicate requests

// Очередь запросов к API
let translationQueue = [];
let isProcessingQueue = false;
let queueTimer = null;

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
    debugLog(`Cache hit for "${text.substring(0, 20)}..."`);
    return translationCache.get(cacheKey);
  }
  
  // Добавляем запрос в очередь с возвратом Promise
  return new Promise((resolve) => {
    // Добавляем запрос в очередь
    translationQueue.push({
      speakerId,
      text,
      inputLang,
      outputLang,
      cacheKey,
      resolve
    });
    
    // Запускаем обработку очереди, если она еще не запущена
    if (!isProcessingQueue) {
      startQueueProcessing();
    }
  });
}

/**
 * Начинает обработку очереди переводов
 */
function startQueueProcessing() {
  if (isProcessingQueue) return;
  
  isProcessingQueue = true;
  processNextInQueue();
}

/**
 * Обрабатывает следующий запрос в очереди переводов
 */
function processNextInQueue() {
  if (translationQueue.length === 0) {
    isProcessingQueue = false;
    return;
  }
  
  // Берем следующий запрос из очереди
  const request = translationQueue.shift();
  const { speakerId, text, inputLang, outputLang, cacheKey, resolve } = request;
  
  // Логируем обработку
  debugLog(`Processing queue item for ${speakerId}: "${text.substring(0, 20)}..."`);
  
  // Выполняем перевод
  performTranslation(speakerId, text, inputLang, outputLang).then(result => {
    // Сохраняем в кэш
    if (result && !result.includes("Translating") && !result.includes("unavailable")) {
      translationCache.set(cacheKey, result);
      
      // Ограничиваем размер кэша
      if (translationCache.size > 100) {
        const keysToDelete = Array.from(translationCache.keys()).slice(0, 20);
        keysToDelete.forEach(key => translationCache.delete(key));
      }
    }
    
    // Возвращаем результат через промис
    resolve(result);
    
    // Планируем обработку следующего элемента через TRANSLATION_THROTTLE мс
    queueTimer = setTimeout(() => {
      processNextInQueue();
    }, Config.TRANSLATION_THROTTLE);
  });
}

/**
 * Выполняет запрос к API для перевода текста
 * @param {string} speakerId - ID говорящего
 * @param {string} text - Текст для перевода
 * @param {string} inputLang - Исходный язык
 * @param {string} outputLang - Целевой язык
 * @returns {Promise<string>} - Переведенный текст
 */
async function performTranslation(speakerId, text, inputLang, outputLang) {
  // Если нет счетчика повторов для этого говорящего, создаем его
  if (!translationRetryCount[speakerId]) {
    translationRetryCount[speakerId] = 0;
  }
  
  try {
    // Формируем запрос к API
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
      temperature: 0.3 // Низкая температура для более стабильных переводов
    };
    
    // Добавляем таймаут с помощью AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 секунд таймаут
    
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Config.OPENAI_API_KEY}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API response error: ${response.status}. Details: ${errorText}`);
      }
      
      const data = await response.json();
      
      // Проверяем структуру ответа
      if (!data || !data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
        throw new Error("Invalid response structure from API");
      }
      
      const translatedText = data.choices[0].message.content.trim();
      
      // Сбрасываем счетчик повторов
      translationRetryCount[speakerId] = 0;
      
      debugLog(`Translation complete: ${translatedText.substring(0, 40)}...`);
      return translatedText;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (error) {
    console.error("Translation error:", error);
    debugLog(`Translation error: ${error.message}`);
    
    // Увеличиваем счетчик повторов
    translationRetryCount[speakerId]++;
    
    // Если слишком много ошибок, возвращаем сообщение о недоступности
    if (translationRetryCount[speakerId] > 3) {
      return "[Translation unavailable]";
    }
    
    // Для первых нескольких ошибок
    return "Translation in progress...";
  }
}

/**
 * Check API connection by making a simple request
 * @returns {Promise<boolean>} True if API is accessible
 */
async function checkApiConnection() {
  try {
    // Добавляем таймаут
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    try {
      // Делаем простой запрос для проверки доступа к API
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
        debugLog(`API check failed: ${response.status}. Details: ${errorText}`);
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
  // Очищаем все активные таймеры
  for (const timerId in activeTimers) {
    clearTimeout(activeTimers[timerId]);
    delete activeTimers[timerId];
  }
  
  // Очищаем очередь переводов
  translationQueue = [];
  isProcessingQueue = false;
  
  // Очищаем таймер очереди
  if (queueTimer) {
    clearTimeout(queueTimer);
    queueTimer = null;
  }
  
  // Сбрасываем счетчики повторов
  translationRetryCount = {};
  
  // Не очищаем кэш переводов, он может быть повторно использован
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
  // Очищаем существующий таймер, если он есть
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