// Configuration settings
const Config = {
  // API key for OpenAI
  OPENAI_API_KEY: "KEY",
  
  // Default languages
  DEFAULT_INPUT_LANG: "auto",
  DEFAULT_OUTPUT_LANG: "en",
  
  // Speech detection and buffering control
  SPEECH_SEGMENT_TIMEOUT: 2000,  // Время ожидания перед завершением высказывания (мс)
  TRANSLATION_THROTTLE: 500,     // Минимальный интервал между запросами к API (мс)
  DEBOUNCE_DELAY: 100,           // Задержка для дебаунса обработки субтитров (мс)
  
  // OpenAI model to use
  MODEL_NAME: "gpt-3.5-turbo-0125",
  
  // Debug settings
  MAX_DEBUG_LOGS: 100,
  
  // Request settings
  MAX_RETRIES: 1,                // Количество повторных попыток при сбое запроса
  RETRY_DELAY: 500,              // Задержка между повторными попытками (мс)
  
  // Performance and stability
  MAX_STORED_UTTERANCES: 5,      // Максимальное количество сохраняемых высказываний
  SUBTITLE_PROCESSING_INTERVAL: 100, // Интервал обработки субтитров (мс)
  OBSERVER_UPDATE_INTERVAL: 30000 // Интервал проверки работоспособности наблюдателя (мс)
};

export default Config;