// Popup window management
import { debugLog, getDebugLogs } from './utils.js';

// Reference to the popup window
let popupWindow = null;

// Set interval to check popup window status
let popupCheckInterval = null;

// Set timeout for popup initialization
let popupInitTimeout = null;

// Prevent reopening too frequently
let lastPopupCreationTime = 0;

// Для отслеживания последнего содержимого окна
let lastSpeakerContents = {};

/**
 * Open the translations window
 * @param {Function} updateTranslationsDisplay - Function to update translations
 * @returns {Window|null} - Reference to the popup window
 */
function openTranslationsWindow(updateTranslationsDisplay) {
  try {
    // Prevent reopening too frequently
    const now = Date.now();
    if (now - lastPopupCreationTime < 3000) {
      return popupWindow;
    }
    lastPopupCreationTime = now;
    
    // Only create new window if needed
    if (!popupWindow || popupWindow.closed) {
      popupWindow = window.open("", "TranslatedSubtitles", "width=600,height=500");
      
      if (!popupWindow) {
        console.error("Popup window was blocked. Please allow popups for this site.");
        return null;
      }
      
      const popupContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Teams Subtitle Translator</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 0;
              margin: 0;
              height: 100vh;
              display: flex;
              flex-direction: column;
              background-color: #f9f9f9;
            }
            header {
              background-color: #0078d4;
              color: white;
              padding: 10px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            h2 {
              margin: 0;
              font-size: 18px;
            }
            .tab-container {
              display: flex;
              background: #f0f0f0;
              border-bottom: 1px solid #ddd;
            }
            .tab {
              padding: 10px 15px;
              cursor: pointer;
              border-right: 1px solid #ddd;
            }
            .tab.active {
              background: #fff;
              font-weight: bold;
              border-bottom: 2px solid #0078d4;
            }
            #main-container {
              flex-grow: 1;
              display: flex;
              flex-direction: column;
              overflow: hidden;
            }
            #subtitles-container {
              flex-grow: 1;
              overflow-y: auto;
              padding: 15px;
              background-color: white;
            }
            #debug-container {
              flex-grow: 1;
              overflow-y: auto;
              padding: 15px;
              background-color: white;
              font-family: monospace;
              font-size: 12px;
              display: none;
            }
            .speaker-block {
              margin-bottom: 20px;
              border-left: 3px solid #0078d4;
              padding-left: 10px;
            }
            .speaker-name {
              font-weight: bold;
              color: #0078d4;
              margin-bottom: 5px;
            }
            .utterance {
              margin-bottom: 10px;
              padding: 10px;
              background-color: #f9f9f9;
              border-radius: 5px;
              border: 1px solid #eee;
            }
            .utterance.active {
              background-color: #f0f7ff;
              border-color: #0078d4;
            }
            .utterance-text {
              font-size: 15px;
              line-height: 1.4;
            }
            .timestamp {
              font-size: 11px;
              color: #888;
              margin-top: 5px;
              text-align: right;
            }
            .controls {
              padding: 10px;
              display: flex;
              justify-content: space-between;
              background: white;
              border-top: 1px solid #ddd;
            }
            button {
              padding: 8px 15px;
              cursor: pointer;
              background-color: #0078d4;
              color: white;
              border: none;
              border-radius: 3px;
              font-weight: bold;
            }
            button:hover {
              background-color: #106ebe;
            }
            .debug-entry {
              color: #666;
              margin-bottom: 3px;
            }
            .badge {
              display: inline-block;
              font-size: 11px;
              padding: 2px 5px;
              border-radius: 3px;
              margin-left: 5px;
              background-color: #f0f0f0;
              color: #666;
            }
            .badge.active {
              background-color: #0078d4;
              color: white;
            }
          </style>
        </head>
        <body>
          <header>
            <h2>Teams Subtitle Translator</h2>
            <span id="status-badge" class="badge active">Active</span>
          </header>
          
          <div class="tab-container">
            <div id="translations-tab" class="tab active">Translations</div>
            <div id="debug-tab" class="tab">Debug</div>
          </div>
          
          <div id="main-container">
            <div id="subtitles-container"></div>
            <div id="debug-container"></div>
          </div>
          
          <div class="controls">
            <button id="clearBtn">Clear All</button>
            <button id="copyBtn">Copy to Clipboard</button>
          </div>
        </body>
        </html>
      `;
      
      popupWindow.document.open();
      popupWindow.document.write(popupContent);
      popupWindow.document.close();
      
      // Give window time to initialize
      clearTimeout(popupInitTimeout);
      popupInitTimeout = setTimeout(() => {
        setupPopupEventListeners(updateTranslationsDisplay);
        debugLog("Popup event listeners setup complete");
        
        // Force an initial update
        updateTranslationsDisplay({}, {});
      }, 300);
      
      // Start checking the popup window status
      startPopupCheck(updateTranslationsDisplay);
      
      debugLog("Popup window opened successfully");
    }
    
    return popupWindow;
  } catch (error) {
    console.error("Error opening translations window:", error);
    return null;
  }
}

/**
 * Setup event listeners for the popup window
 * @param {Function} updateTranslationsDisplay - Function to update translations
 */
function setupPopupEventListeners(updateTranslationsDisplay) {
  if (!popupWindow || popupWindow.closed) return;
  
  try {
    // Tab switching
    const translationsTab = popupWindow.document.getElementById('translations-tab');
    const debugTab = popupWindow.document.getElementById('debug-tab');
    const subtitlesContainer = popupWindow.document.getElementById('subtitles-container');
    const debugContainer = popupWindow.document.getElementById('debug-container');
    
    if (translationsTab && debugTab && subtitlesContainer && debugContainer) {
      translationsTab.addEventListener('click', function() {
        translationsTab.classList.add('active');
        debugTab.classList.remove('active');
        subtitlesContainer.style.display = 'block';
        debugContainer.style.display = 'none';
      });
      
      debugTab.addEventListener('click', function() {
        debugTab.classList.add('active');
        translationsTab.classList.remove('active');
        subtitlesContainer.style.display = 'none';
        debugContainer.style.display = 'block';
      });
    }
    
    // Clear button
    const clearBtn = popupWindow.document.getElementById('clearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        if (window.clearAllTranslations && typeof window.clearAllTranslations === 'function') {
          window.clearAllTranslations();
        }
      });
    }
    
    // Copy button
    const copyBtn = popupWindow.document.getElementById('copyBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function() {
        if (!subtitlesContainer) return;
        
        const text = Array.from(subtitlesContainer.querySelectorAll('.speaker-block')).map(block => {
          const speakerNameEl = block.querySelector('.speaker-name');
          const speaker = speakerNameEl ? speakerNameEl.textContent : 'Unknown';
          const utterances = Array.from(block.querySelectorAll('.utterance-text')).map(u => u.textContent);
          return speaker + ':\n' + utterances.join('\n');
        }).join('\n\n');
        
        popupWindow.navigator.clipboard.writeText(text)
          .then(() => alert('Translations copied to clipboard'))
          .catch(err => alert('Failed to copy: ' + err.message));
      });
    }
    
    debugLog("Popup event listeners set up successfully");
  } catch (error) {
    console.error("Error setting up popup event listeners:", error);
  }
}

/**
 * Check if popup window is accessible and responsive
 * @returns {boolean} - True if popup is accessible
 */
function isPopupAccessible() {
  try {
    return popupWindow && !popupWindow.closed && popupWindow.document;
  } catch (e) {
    return false;
  }
}

/**
 * Update debug logs in the popup window
 */
function updateDebugLogs() {
  if (!isPopupAccessible()) return;
  
  try {
    const debugContainer = popupWindow.document.getElementById('debug-container');
    if (debugContainer) {
      // Get logs
      const logs = getDebugLogs();
      
      // Only update if there are logs
      if (logs.length === 0) return;
      
      // Clear container
      debugContainer.innerHTML = '';
      
      // Add logs as a batch
      const fragment = popupWindow.document.createDocumentFragment();
      
      for (const log of logs) {
        const logDiv = popupWindow.document.createElement('div');
        logDiv.className = 'debug-entry';
        logDiv.textContent = log;
        fragment.appendChild(logDiv);
      }
      
      debugContainer.appendChild(fragment);
      
      // Auto-scroll to bottom
      debugContainer.scrollTop = debugContainer.scrollHeight;
    }
  } catch (error) {
    console.error("Error updating debug logs:", error);
  }
}

/**
 * Start checking popup window status
 * @param {Function} updateTranslationsDisplay - Function to update translations
 */
function startPopupCheck(updateTranslationsDisplay) {
  if (popupCheckInterval) {
    clearInterval(popupCheckInterval);
  }
  
  popupCheckInterval = setInterval(() => {
    if (window.isTranslationActive) {
      if (!isPopupAccessible()) {
        debugLog("Popup window was closed, reopening...");
        openTranslationsWindow(updateTranslationsDisplay);
      }
    }
  }, 3000); // Check every 3 seconds
}

/**
 * Stop popup check interval
 */
function stopPopupCheck() {
  if (popupCheckInterval) {
    clearInterval(popupCheckInterval);
    popupCheckInterval = null;
  }
}

/**
 * Update the translation display in the popup
 * @param {Object} translatedUtterances - Map of speaker IDs to their latest utterances
 * @param {Object} activeSpeakers - Map of active speakers
 */
function updateTranslationsDisplay(translatedUtterances, activeSpeakers) {
  if (!isPopupAccessible()) {
    return;
  }
  
  try {
    // Получаем контейнер субтитров
    const subtitlesContainer = popupWindow.document.getElementById('subtitles-container');
    if (!subtitlesContainer) return;
    
    // Проверяем, находимся ли мы внизу контейнера (для автопрокрутки)
    const isAtBottom = subtitlesContainer.scrollHeight - subtitlesContainer.scrollTop - subtitlesContainer.clientHeight < 50;
    
    // РАДИКАЛЬНОЕ РЕШЕНИЕ:
    // 1. Каждый раз полностью очищаем контейнер
    // 2. Добавляем только ПОСЛЕДНЕЕ высказывание от каждого говорящего
    
    // Собираем все высказывания в один массив
    const allUtterances = [];
    
    // Добавляем финализированные высказывания
    for (const speakerId in translatedUtterances) {
      const utterance = translatedUtterances[speakerId];
      if (utterance) {
        allUtterances.push({
          ...utterance,
          active: false // Финализированные высказывания не активны
        });
      }
    }
    
    // Добавляем активные высказывания (они перезапишут финализированные)
    for (const speakerId in activeSpeakers) {
      const speaker = activeSpeakers[speakerId];
      allUtterances.push({
        id: speaker.utteranceId,
        speaker: speaker.speaker,
        speakerId: speakerId,
        original: speaker.fullText,
        translated: speaker.translatedText || "Translating...",
        timestamp: new Date().toLocaleTimeString(),
        active: true
      });
    }
    
    // Проверяем, изменилось ли содержимое
    let hasChanged = false;
    
    for (const utterance of allUtterances) {
      const speakerId = utterance.speakerId;
      const content = utterance.translated || "";
      
      if (!lastSpeakerContents[speakerId] || lastSpeakerContents[speakerId] !== content) {
        hasChanged = true;
        lastSpeakerContents[speakerId] = content;
      }
    }
    
    // Если ничего не изменилось, не обновляем DOM
    if (!hasChanged && Object.keys(lastSpeakerContents).length === allUtterances.length) {
      return;
    }
    
    // Очищаем список высказываний, которых больше нет
    const currentSpeakerIds = allUtterances.map(u => u.speakerId);
    for (const speakerId in lastSpeakerContents) {
      if (!currentSpeakerIds.includes(speakerId)) {
        delete lastSpeakerContents[speakerId];
      }
    }
    
    // Очистить полностью содержимое контейнера
    subtitlesContainer.innerHTML = '';
    
    // Группируем высказывания по говорящему
    const speakerGroups = {};
    
    for (const utterance of allUtterances) {
      const speakerId = utterance.speakerId;
      
      // Проверяем, есть ли уже группа для этого говорящего
      if (!speakerGroups[speakerId]) {
        speakerGroups[speakerId] = {
          name: utterance.speaker,
          id: speakerId,
          utterance: utterance
        };
      } else if (utterance.active) {
        // Если новое высказывание активно, оно приоритетнее
        speakerGroups[speakerId].utterance = utterance;
      }
    }
    
    // Создаем фрагмент для более эффективного добавления в DOM
    const fragment = popupWindow.document.createDocumentFragment();
    
    // Для каждого говорящего создаем блок с его последним высказыванием
    for (const speakerId in speakerGroups) {
      const group = speakerGroups[speakerId];
      const utterance = group.utterance;
      
      // Создаем блок говорящего
      const speakerBlock = popupWindow.document.createElement('div');
      speakerBlock.className = 'speaker-block';
      speakerBlock.dataset.speakerId = speakerId;
      
      // Имя говорящего
      const speakerName = popupWindow.document.createElement('div');
      speakerName.className = 'speaker-name';
      speakerName.textContent = group.name;
      speakerBlock.appendChild(speakerName);
      
      // Высказывание
      const utteranceEl = popupWindow.document.createElement('div');
      utteranceEl.className = utterance.active ? 'utterance active' : 'utterance';
      utteranceEl.dataset.utteranceId = utterance.id;
      
      // Текст высказывания
      const textDiv = popupWindow.document.createElement('div');
      textDiv.className = 'utterance-text';
      textDiv.textContent = utterance.translated || "";
      utteranceEl.appendChild(textDiv);
      
      // Время
      const timeDiv = popupWindow.document.createElement('div');
      timeDiv.className = 'timestamp';
      timeDiv.textContent = utterance.timestamp || "";
      utteranceEl.appendChild(timeDiv);
      
      speakerBlock.appendChild(utteranceEl);
      fragment.appendChild(speakerBlock);
    }
    
    // Добавляем все элементы во фрагмент, а затем в DOM
    subtitlesContainer.appendChild(fragment);
    
    // Прокручиваем вниз, если мы были внизу
    if (isAtBottom) {
      subtitlesContainer.scrollTop = subtitlesContainer.scrollHeight;
    }
    
    // Также обновляем отладочные логи
    updateDebugLogs();
  } catch (error) {
    console.error("Error updating translations display:", error);
    debugLog(`Error updating display: ${error.message}`);
  }
}

/**
 * Set translation status in popup
 * @param {boolean} isActive - Whether translation is active
 */
function setTranslationStatus(isActive) {
  if (!isPopupAccessible()) return;
  
  try {
    const statusBadge = popupWindow.document.getElementById('status-badge');
    if (statusBadge) {
      statusBadge.textContent = isActive ? 'Active' : 'Inactive';
      statusBadge.className = isActive ? 'badge active' : 'badge';
    }
  } catch (e) {
    console.error("Error updating status:", e);
  }
}

/**
 * Close popup window
 */
function closePopupWindow() {
  if (popupWindow && !popupWindow.closed) {
    try {
      popupWindow.close();
    } catch (e) {
      console.error("Error closing popup window:", e);
    }
  }
  
  popupWindow = null;
  lastSpeakerContents = {};
}

export {
  openTranslationsWindow,
  updateTranslationsDisplay,
  updateDebugLogs,
  setTranslationStatus,
  stopPopupCheck,
  closePopupWindow
};