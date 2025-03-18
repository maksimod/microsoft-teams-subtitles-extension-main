// Popup window management
import { debugLog, getDebugLogs } from './utils.js';

// Reference to the popup window
let popupWindow = null;

// Set interval to check popup window status
let popupCheckInterval = null;

/**
 * Open the translations window
 * @param {Function} updateTranslationsDisplay - Function to update translations
 * @returns {Window|null} - Reference to the popup window
 */
function openTranslationsWindow(updateTranslationsDisplay) {
  try {
    if (!popupWindow || popupWindow.closed) {
      // Create a new popup window if it doesn't exist or is closed
      popupWindow = window.open("", "TranslatedSubtitles", "width=600,height=500");
      if (popupWindow) {
        popupWindow.document.write(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Translated Subtitles</title>
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
        `);

        // Ensure the popup window's DOM is fully loaded before updating
        popupWindow.document.close();
        
        // Set up event listeners when the DOM is fully loaded
        popupWindow.addEventListener('DOMContentLoaded', () => setupPopupEventListeners(updateTranslationsDisplay));
        
        // Also try to set up listeners immediately in case DOMContentLoaded already fired
        setupPopupEventListeners(updateTranslationsDisplay);
        
        debugLog("Popup window opened successfully.");
        
        // Start checking popup window status
        startPopupCheck(updateTranslationsDisplay);
        
        // Update the debug logs
        updateDebugLogs();
      } else {
        console.error("Popup window was blocked. Please allow popups for this site.");
      }
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
        
        popupWindow.navigator.clipboard.writeText(text).then(() => {
          popupWindow.alert('Translations copied to clipboard');
        }).catch(err => {
          console.error('Failed to copy: ', err);
          popupWindow.alert('Failed to copy: ' + err.message);
        });
      });
    }
    
    // Auto-scroll for containers
    setupAutoScroll(subtitlesContainer);
    setupAutoScroll(debugContainer);
    
    debugLog("Popup event listeners set up successfully");
  } catch (error) {
    console.error("Error setting up popup event listeners:", error);
  }
}

/**
 * Set up auto-scroll for a container
 * @param {HTMLElement} container - The container to auto-scroll
 */
function setupAutoScroll(container) {
  if (!container || !popupWindow) return;
  
  try {
    const observer = new popupWindow.MutationObserver(() => {
      container.scrollTop = container.scrollHeight;
    });
    
    observer.observe(container, { 
      childList: true, 
      subtree: true 
    });
  } catch (error) {
    console.error("Error setting up auto-scroll:", error);
  }
}

/**
 * Update debug logs in the popup window
 */
function updateDebugLogs() {
  if (!popupWindow || popupWindow.closed) return;
  
  try {
    const debugContainer = popupWindow.document.getElementById('debug-container');
    if (debugContainer) {
      // Clear existing logs
      debugContainer.innerHTML = '';
      
      // Add all debug logs
      for (const log of getDebugLogs()) {
        const logDiv = popupWindow.document.createElement('div');
        logDiv.className = 'debug-entry';
        logDiv.textContent = log;
        debugContainer.appendChild(logDiv);
      }
    }
  } catch (error) {
    console.error("Error updating debug logs:", error);
  }
}

/**
 * Start checking popup window status
 * @param {boolean} isTranslationActive - Whether translation is active
 * @param {Function} updateTranslationsDisplay - Function to update translations
 */
function startPopupCheck(updateTranslationsDisplay) {
  if (popupCheckInterval) {
    clearInterval(popupCheckInterval);
  }
  
  popupCheckInterval = setInterval(() => {
    if (window.isTranslationActive && (!popupWindow || popupWindow.closed)) {
      debugLog("Popup window was closed, reopening...");
      openTranslationsWindow(updateTranslationsDisplay);
    }
  }, 2000); // Check every 2 seconds
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
 * @param {Array} translatedUtterances - Array of translated utterances
 * @param {Object} activeSpeakers - Map of active speakers
 */
function updateTranslationsDisplay(translatedUtterances, activeSpeakers) {
  if (!popupWindow || popupWindow.closed) {
    return;
  }
  
  try {
    // Get the subtitles container
    const subtitlesContainer = popupWindow.document.getElementById('subtitles-container');
    
    if (!subtitlesContainer) {
      debugLog("subtitles container not found, retrying...");
      setTimeout(() => updateTranslationsDisplay(translatedUtterances, activeSpeakers), 100);
      return;
    }
    
    // Clear the container
    subtitlesContainer.innerHTML = "";
    
    // Create a map of speaker blocks
    const speakerBlocks = {};
    
    // Add all finalized utterances
    for (const utterance of translatedUtterances) {
      if (!speakerBlocks[utterance.speakerId]) {
        speakerBlocks[utterance.speakerId] = createSpeakerBlock(utterance.speaker);
      }
      
      // Add this utterance to the speaker's block
      const utteranceDiv = createUtteranceDiv(utterance, false);
      speakerBlocks[utterance.speakerId].appendChild(utteranceDiv);
    }
    
    // Add active utterances
    for (const speakerId in activeSpeakers) {
      const activeSpeech = activeSpeakers[speakerId];
      
      if (!speakerBlocks[speakerId]) {
        speakerBlocks[speakerId] = createSpeakerBlock(activeSpeech.speaker);
      }
      
      // Create an utterance object for the active speech
      const activeUtterance = {
        id: activeSpeech.utteranceId,
        speaker: activeSpeech.speaker,
        original: activeSpeech.fullText,
        translated: activeSpeech.translatedText || "Translating...",
        timestamp: new Date().toLocaleTimeString()
      };
      
      // Add the active utterance to the speaker's block
      const utteranceDiv = createUtteranceDiv(activeUtterance, true);
      speakerBlocks[speakerId].appendChild(utteranceDiv);
    }
    
    // Add all speaker blocks to the container
    for (const speakerId in speakerBlocks) {
      subtitlesContainer.appendChild(speakerBlocks[speakerId]);
    }
    
    // Update the debug logs too
    updateDebugLogs();
    
    // Function to create a speaker block
    function createSpeakerBlock(speakerName) {
      const speakerBlock = popupWindow.document.createElement('div');
      speakerBlock.className = 'speaker-block';
      
      const speakerNameDiv = popupWindow.document.createElement('div');
      speakerNameDiv.className = 'speaker-name';
      speakerNameDiv.textContent = speakerName;
      speakerBlock.appendChild(speakerNameDiv);
      
      return speakerBlock;
    }
    
    // Function to create an utterance div
    function createUtteranceDiv(utterance, isActive) {
      const utteranceDiv = popupWindow.document.createElement('div');
      utteranceDiv.className = isActive ? 'utterance active' : 'utterance';
      
      const textDiv = popupWindow.document.createElement('div');
      textDiv.className = 'utterance-text';
      textDiv.textContent = utterance.translated;
      utteranceDiv.appendChild(textDiv);
      
      const timestampDiv = popupWindow.document.createElement('div');
      timestampDiv.className = 'timestamp';
      timestampDiv.textContent = utterance.timestamp;
      utteranceDiv.appendChild(timestampDiv);
      
      return utteranceDiv;
    }
  } catch (error) {
    console.error("Error updating translations display:", error);
    // If we got an error, the popup window might be inaccessible
    // We'll leave it to the caller to handle reopening if needed
  }
}

/**
 * Set translation status in popup
 * @param {boolean} isActive - Whether translation is active
 */
function setTranslationStatus(isActive) {
  if (!popupWindow || popupWindow.closed) return;
  
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
    popupWindow.close();
  }
  popupWindow = null;
}

export {
  openTranslationsWindow,
  updateTranslationsDisplay,
  updateDebugLogs,
  setTranslationStatus,
  stopPopupCheck,
  closePopupWindow
};