// Inline Translation Display - Use direct DOM injection instead of popup
import Config from './config.js';
import { debugLog, getSpeakerId } from './utils.js';

// Keep track of inserted elements
let translationContainer = null;
let translationElements = {};
let isDisplayInitialized = false;

// Для отслеживания последних переводов
let lastTranslations = {};

/**
 * Initialize the inline translation display
 */
function initializeDisplay() {
  if (isDisplayInitialized) return;
  
  try {
    // First remove any existing container (if any)
    const existingContainer = document.getElementById('teams-subtitle-translator-container');
    if (existingContainer) {
      existingContainer.remove();
    }
    
    // Create main container
    translationContainer = document.createElement('div');
    translationContainer.id = 'teams-subtitle-translator-container';
    
    // Position it over the Teams UI, above the subtitle area
    Object.assign(translationContainer.style, {
      position: 'fixed',
      bottom: '140px',  // Position above the Teams subtitle area
      left: '20%', 
      width: '60%',
      maxHeight: '40%',
      overflowY: 'auto',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      border: '1px solid #0078d4',
      borderRadius: '6px',
      padding: '10px',
      zIndex: '9999',
      fontFamily: 'Segoe UI, Arial, sans-serif',
      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
      transition: 'all 0.3s ease'
    });
    
    // Create header
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '10px',
      paddingBottom: '5px',
      borderBottom: '1px solid #ddd'
    });
    
    // Title
    const title = document.createElement('div');
    title.textContent = 'Translations';
    Object.assign(title.style, {
      fontWeight: 'bold',
      color: '#0078d4'
    });
    
    // Controls
    const controls = document.createElement('div');
    
    // Close button
    const closeButton = document.createElement('button');
    closeButton.textContent = '✕';
    Object.assign(closeButton.style, {
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      color: '#666',
      fontSize: '16px'
    });
    closeButton.addEventListener('click', () => {
      translationContainer.style.display = 'none';
    });
    
    controls.appendChild(closeButton);
    header.appendChild(title);
    header.appendChild(controls);
    translationContainer.appendChild(header);
    
    // Create content container
    const contentContainer = document.createElement('div');
    contentContainer.id = 'teams-subtitle-translator-content';
    translationContainer.appendChild(contentContainer);
    
    // Add to document
    document.body.appendChild(translationContainer);
    isDisplayInitialized = true;
    
    debugLog("Inline translation display initialized");
  } catch (error) {
    console.error("Error initializing inline display:", error);
    debugLog(`Display error: ${error.message}`);
  }
}

/**
 * Update the translation display
 * @param {Object} translatedUtterances - Map of speaker IDs to their latest utterances
 * @param {Object} activeSpeakers - Map of active speakers
 */
function updateDisplay(translatedUtterances, activeSpeakers) {
  if (!isDisplayInitialized) {
    initializeDisplay();
  }
  
  if (!translationContainer) return;
  
  try {
    // Показывать контейнер если он скрыт
    translationContainer.style.display = 'block';
    
    // Получить контейнер содержимого
    const contentContainer = document.getElementById('teams-subtitle-translator-content');
    if (!contentContainer) return;
    
    // Записать текущую позицию прокрутки
    const scrollPosition = translationContainer.scrollTop;
    const isAtBottom = (translationContainer.scrollHeight - translationContainer.scrollTop - translationContainer.clientHeight) < 50;
    
    // РАДИКАЛЬНО УПРОЩАЕМ - всегда полностью перестраиваем содержимое
    // Проверяем есть ли изменения
    let hasChanges = false;
    
    // Собираем все текущие переводы
    const currentTranslations = {};
    
    // Добавляем финализированные высказывания
    for (const speakerId in translatedUtterances) {
      const utterance = translatedUtterances[speakerId];
      if (utterance) {
        currentTranslations[speakerId] = utterance.translated || "";
      }
    }
    
    // Добавляем активные высказывания (они перезапишут финализированные)
    for (const speakerId in activeSpeakers) {
      const speaker = activeSpeakers[speakerId];
      currentTranslations[speakerId] = speaker.translatedText || "Translating...";
    }
    
    // Проверяем изменения
    for (const speakerId in currentTranslations) {
      if (!lastTranslations[speakerId] || lastTranslations[speakerId] !== currentTranslations[speakerId]) {
        hasChanges = true;
        break;
      }
    }
    
    // Проверяем удаленные высказывания
    for (const speakerId in lastTranslations) {
      if (!currentTranslations[speakerId]) {
        hasChanges = true;
        break;
      }
    }
    
    // Если нет изменений, не обновляем DOM
    if (!hasChanges) {
      return;
    }
    
    // Обновляем кэш последних переводов
    lastTranslations = {...currentTranslations};
    
    // Очищаем контейнер
    contentContainer.innerHTML = '';
    
    // Создаем фрагмент для добавления всего содержимого
    const fragment = document.createDocumentFragment();
    
    // Добавляем блоки для каждого говорящего
    for (const speakerId in currentTranslations) {
      // Получаем имя говорящего
      let speakerName = "Unknown";
      
      if (translatedUtterances[speakerId]) {
        speakerName = translatedUtterances[speakerId].speaker;
      } else if (activeSpeakers[speakerId]) {
        speakerName = activeSpeakers[speakerId].speaker;
      }
      
      // Получаем текст перевода
      const translatedText = currentTranslations[speakerId];
      
      // Проверяем активность
      const isActive = !!activeSpeakers[speakerId];
      
      // Создаем блок говорящего
      const speakerBlock = document.createElement('div');
      speakerBlock.className = 'translator-speaker-block';
      Object.assign(speakerBlock.style, {
        marginBottom: '15px',
        borderLeft: '3px solid #0078d4',
        paddingLeft: '10px'
      });
      
      // Имя говорящего
      const speakerNameElem = document.createElement('div');
      speakerNameElem.textContent = speakerName;
      Object.assign(speakerNameElem.style, {
        fontWeight: 'bold',
        color: '#0078d4',
        marginBottom: '5px'
      });
      speakerBlock.appendChild(speakerNameElem);
      
      // Высказывание
      const utteranceDiv = document.createElement('div');
      utteranceDiv.className = 'translator-utterance';
      Object.assign(utteranceDiv.style, {
        marginBottom: '8px',
        padding: '8px',
        backgroundColor: isActive ? '#f0f7ff' : '#f5f5f5',
        borderRadius: '4px',
        border: isActive ? '1px solid #0078d4' : '1px solid #eee'
      });
      
      // Текст
      const textDiv = document.createElement('div');
      textDiv.textContent = translatedText || "...";
      Object.assign(textDiv.style, {
        fontSize: '14px',
        lineHeight: '1.4'
      });
      utteranceDiv.appendChild(textDiv);
      
      // Время
      const timeDiv = document.createElement('div');
      timeDiv.textContent = new Date().toLocaleTimeString();
      Object.assign(timeDiv.style, {
        fontSize: '11px',
        color: '#888',
        textAlign: 'right',
        marginTop: '4px'
      });
      utteranceDiv.appendChild(timeDiv);
      
      speakerBlock.appendChild(utteranceDiv);
      fragment.appendChild(speakerBlock);
    }
    
    // Добавляем весь фрагмент в контейнер
    contentContainer.appendChild(fragment);
    
    // Восстанавливаем позицию прокрутки
    if (isAtBottom) {
      translationContainer.scrollTop = translationContainer.scrollHeight;
    } else {
      translationContainer.scrollTop = scrollPosition;
    }
    
  } catch (error) {
    console.error("Error updating display:", error);
    debugLog(`Display update error: ${error.message}`);
  }
}

/**
 * Set display active status
 * @param {boolean} isActive - Is translation active
 */
function setDisplayStatus(isActive) {
  if (!isDisplayInitialized) {
    if (isActive) {
      initializeDisplay();
    } else {
      return;
    }
  }
  
  if (!translationContainer) return;
  
  // Show or hide based on status
  translationContainer.style.display = isActive ? 'block' : 'none';
}

/**
 * Clear display
 */
function clearDisplay() {
  if (!translationContainer) return;
  
  const contentContainer = document.getElementById('teams-subtitle-translator-content');
  if (contentContainer) {
    contentContainer.innerHTML = '';
  }
  
  // Очищаем кэш
  lastTranslations = {};
}

export {
  initializeDisplay,
  updateDisplay,
  setDisplayStatus,
  clearDisplay
};