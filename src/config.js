// Configuration settings
const Config = {
  // API key for OpenAI
  OPENAI_API_KEY: "KEY",
  
  // Default languages
  DEFAULT_INPUT_LANG: "auto",
  DEFAULT_OUTPUT_LANG: "en",
  
  // Speech detection and buffering control
  SPEECH_SEGMENT_TIMEOUT: 5000, // Time between speech segments to consider them separate
  TRANSLATION_THROTTLE: 3000, // Increased to 3000ms to avoid API rate limits
  DEBOUNCE_DELAY: 300, // 300ms for better stability
  
  // OpenAI model to use - используем более простую модель
  MODEL_NAME: "gpt-3.5-turbo-0125",
  
  // Debug settings
  MAX_DEBUG_LOGS: 100,
  
  // Request settings
  MAX_RETRIES: 2,
  RETRY_DELAY: 1000
};

export default Config;