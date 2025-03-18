// Wrap the entire script in a self-executing function to avoid global scope pollution
(async function () {
  // Check if the script has already run
  if (window.hasTranslationScriptRun) return;
  window.hasTranslationScriptRun = true; // Mark the script as run

  // Variables to store user preferences
  let inputLang = "auto";
  let outputLang = "en";
  let isTranslationActive = false;
  let OPENAI_API_KEY = "KEYOPEN";

  // Reference to the popup window
  let popupWindow = null;
  
  // Reference to the MutationObserver
  let observer = null;
  
  // Speech detection variables
  let allCapturedText = []; // Array of all text segments in this session
  let activeSpeakers = {}; // Map of active speakers and their current utterances
  let knownSubtitles = new Set(); // Set of known subtitle texts to avoid duplicates
  
  // Speech buffering control
  const SPEECH_SEGMENT_TIMEOUT = 5000; // Time between speech segments to consider them separate
  const TRANSLATION_THROTTLE = 1000; // Minimum time between translation updates
  
  // Keep track of translations and timers
  let translatedUtterances = []; // Fully translated utterances
  let activeTimers = {}; // To track all active timers
  let lastTranslationRequestTime = {};
  let pendingTranslations = {};
  
  // For monitoring
  let debugLogs = [];
  const MAX_DEBUG_LOGS = 100;
  
  // Set interval to check popup window status
  let popupCheckInterval = null;
  
  // Add debug logging
  function debugLog(message) {
    const timestamp = new Date().toISOString().substr(11, 8);
    const logEntry = `${timestamp}: ${message}`;
    debugLogs.push(logEntry);
    
    // Keep log size manageable
    if (debugLogs.length > MAX_DEBUG_LOGS) {
      debugLogs.shift();
    }
    
    console.log(logEntry);
    
    // Update debug logs if popup is open
    if (popupWindow && !popupWindow.closed) {
      try {
        updateDebugLogs();
      } catch (e) {
        // Ignore errors when updating debug logs
      }
    }
  }

  // Function to open the translations window
  function openTranslationsWindow() {
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
          popupWindow.addEventListener('DOMContentLoaded', setupPopupEventListeners);
          
          // Also try to set up listeners immediately in case DOMContentLoaded already fired
          setupPopupEventListeners();
          
          debugLog("Popup window opened successfully.");
          
          // Start checking popup window status
          startPopupCheck();
          
          // Update the debug logs
          updateDebugLogs();
          
          // Add all existing translations
          updateTranslationsDisplay();
        } else {
          console.error("Popup window was blocked. Please allow popups for this site.");
        }
      }
    } catch (error) {
      console.error("Error opening translations window:", error);
    }
  }
  
  // Setup event listeners for the popup window
  function setupPopupEventListeners() {
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
          if (subtitlesContainer) subtitlesContainer.innerHTML = '';
          if (debugContainer) debugContainer.innerHTML = '';
          
          // Clear the stored data
          translatedUtterances = [];
          activeSpeakers = {};
          knownSubtitles.clear();
          allCapturedText = [];
          debugLogs = [];
          
          // Clear all active timers
          for (const timerId in activeTimers) {
            clearTimeout(activeTimers[timerId]);
            delete activeTimers[timerId];
          }
          
          debugLog("All translations cleared");
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
  
  // Set up auto-scroll for a container
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
  
  // Function to update debug logs in the popup window
  function updateDebugLogs() {
    if (!popupWindow || popupWindow.closed) return;
    
    try {
      const debugContainer = popupWindow.document.getElementById('debug-container');
      if (debugContainer) {
        // Clear existing logs
        debugContainer.innerHTML = '';
        
        // Add all debug logs
        for (const log of debugLogs) {
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
  
  // Function to handle messages from popup window
  function handlePopupMessage(event) {
    if (event.data && event.data.action === 'subtitlesCleared') {
      debugLog("Received clear request from popup");
      translatedUtterances = [];
      activeSpeakers = {};
      knownSubtitles.clear();
      allCapturedText = [];
      debugLogs = [];
      
      // Clear all active timers
      for (const timerId in activeTimers) {
        clearTimeout(activeTimers[timerId]);
        delete activeTimers[timerId];
      }
    }
  }
  
  // Function to check and reopen popup window if needed
  function startPopupCheck() {
    if (popupCheckInterval) {
      clearInterval(popupCheckInterval);
    }
    
    popupCheckInterval = setInterval(() => {
      if (isTranslationActive && (!popupWindow || popupWindow.closed)) {
        debugLog("Popup window was closed, reopening...");
        openTranslationsWindow();
      }
    }, 2000); // Check every 2 seconds
  }

  // Function to translate text using OpenAI API
  async function translateText(speakerId, text) {
    // Don't translate if the text is too short
    if (text.length < 2) return text;
    
    // Check if we need to throttle this translation request
    const now = Date.now();
    if (lastTranslationRequestTime[speakerId] && 
        now - lastTranslationRequestTime[speakerId] < TRANSLATION_THROTTLE) {
      // If there's already a pending translation for this speaker, replace it
      if (pendingTranslations[speakerId]) {
        pendingTranslations[speakerId].text = text;
        debugLog(`Throttled translation request for ${speakerId}, queued for later`);
        return null; // Translation will happen later
      }
      
      // Schedule a translation for later
      const timeToWait = TRANSLATION_THROTTLE - (now - lastTranslationRequestTime[speakerId]);
      
      pendingTranslations[speakerId] = { text };
      
      activeTimers[`translate_${speakerId}`] = setTimeout(() => {
        const pendingText = pendingTranslations[speakerId]?.text;
        if (pendingText) {
          delete pendingTranslations[speakerId];
          translateText(speakerId, pendingText); // Actually do the translation now
        }
      }, timeToWait);
      
      debugLog(`Queued translation for ${speakerId} in ${timeToWait}ms`);
      return null;
    }
    
    // Update the last translation request time
    lastTranslationRequestTime[speakerId] = now;
    
    try {
      debugLog(`Translating for ${speakerId}: ${text.substring(0, 40)}...`);
      
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo-0125',
          messages: [
            {
              role: "user",
              content: `Translate the following text from ${inputLang} to ${outputLang}. Preserve the style and meaning: ${text}`,
            },
          ],
        }),
      });

      const data = await response.json();
      const translatedText = data.choices[0].message.content.trim();
      debugLog(`Translation complete: ${translatedText.substring(0, 40)}...`);
      return translatedText;
    } catch (error) {
      console.error("Translation error:", error);
      debugLog(`Translation error: ${error.message}`);
      return null;
    }
  }
  
  // Check if a text is a continuation of current speech
  function isContinuationOfSpeech(speaker, text) {
    // If there's no active speech for this speaker, it's not a continuation
    if (!activeSpeakers[speaker] || !activeSpeakers[speaker].lastTime) {
      return false;
    }
    
    // If too much time has passed, it's not a continuation
    const timeSinceLastSegment = Date.now() - activeSpeakers[speaker].lastTime;
    if (timeSinceLastSegment > SPEECH_SEGMENT_TIMEOUT) {
      return false;
    }
    
    // Simple heuristic: if the new text starts with lowercase and the previous doesn't end with punctuation
    const lastSegment = activeSpeakers[speaker].segments[activeSpeakers[speaker].segments.length - 1];
    const lastChar = lastSegment[lastSegment.length - 1];
    const isPunctuation = ['.', '!', '?', ':', ';'].includes(lastChar);
    const startsWithLowerCase = text.length > 0 && text[0] === text[0].toLowerCase() && text[0] !== text[0].toUpperCase();
    
    // If previous segment doesn't end with punctuation and new segment starts with lowercase,
    // it's likely a continuation
    if (!isPunctuation && startsWithLowerCase) {
      return true;
    }
    
    // TODO: Add more heuristics to detect continued speech
    
    return false;
  }
  
  // Function to generate a unique ID for a speaker
  function getSpeakerId(speakerName) {
    return `speaker_${speakerName.replace(/[^a-z0-9]/gi, '_')}`;
  }

  // Function to detect and process subtitles
  function processSubtitles() {
    if (!isTranslationActive) {
      return;
    }

    // Select all subtitle containers
    const subtitleContainers = document.querySelectorAll(
      'span[dir="auto"][data-tid="closed-caption-text"]'
    );

    if (subtitleContainers.length === 0) {
      return;
    }

    // Process each subtitle container
    for (const subtitleContainer of subtitleContainers) {
      const text = subtitleContainer.innerText.trim();
      
      // Skip if the text is empty or already processed
      if (!text || knownSubtitles.has(text)) {
        continue;
      }
      
      // Add to known subtitles set
      knownSubtitles.add(text);
      
      // Add to all captured text
      allCapturedText.push(text);
      
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
      
      debugLog(`Detected subtitle from ${speakerName}: "${text}"`);
      
      // Check if this is a continued speech or a new one
      if (activeSpeakers[speakerId] && isContinuationOfSpeech(speakerId, text)) {
        // Continuation of current speech
        // Update the time of the last segment
        activeSpeakers[speakerId].lastTime = Date.now();
        
        // Add this segment to the segments array
        activeSpeakers[speakerId].segments.push(text);
        
        // Reset the finalization timer
        if (activeTimers[`finalize_${speakerId}`]) {
          clearTimeout(activeTimers[`finalize_${speakerId}`]);
        }
        
        // Set a new finalization timer
        activeTimers[`finalize_${speakerId}`] = setTimeout(() => {
          finalizeSpeech(speakerId);
        }, SPEECH_SEGMENT_TIMEOUT);
        
        // Update the full text
        activeSpeakers[speakerId].fullText = activeSpeakers[speakerId].segments.join(' ');
        
        // Translate the updated text
        translateAndUpdateUtterance(speakerId);
      } else {
        // This is a new speech or from a different speaker
        
        // If there was an active speech from this speaker, finalize it
        if (activeSpeakers[speakerId]) {
          finalizeSpeech(speakerId);
        }
        
        // Create a new active speech entry
        activeSpeakers[speakerId] = {
          speaker: speakerName,
          segments: [text],
          fullText: text,
          lastTime: Date.now(),
          translatedText: null,
          utteranceId: Date.now().toString(),
          active: true
        };
        
        // Set a finalization timer
        activeTimers[`finalize_${speakerId}`] = setTimeout(() => {
          finalizeSpeech(speakerId);
        }, SPEECH_SEGMENT_TIMEOUT);
        
        // Start translation for this new segment
        translateAndUpdateUtterance(speakerId);
      }
      
      // Update the display
      updateTranslationsDisplay();
    }
  }
  
  // Function to translate and update an active utterance
  async function translateAndUpdateUtterance(speakerId) {
    if (!activeSpeakers[speakerId]) return;
    
    const utterance = activeSpeakers[speakerId];
    const textToTranslate = utterance.fullText;
    
    // If this is a very short text, don't bother translating yet
    if (textToTranslate.length < 3) {
      utterance.translatedText = "...";
      updateTranslationsDisplay();
      return;
    }
    
    // Translate the text
    const translatedText = await translateText(speakerId, textToTranslate);
    
    // If translation was throttled, it will return null and be handled later
    if (translatedText === null) return;
    
    // If this speaker is still active and this is still the current utterance
    if (activeSpeakers[speakerId] && activeSpeakers[speakerId].utteranceId === utterance.utteranceId) {
      activeSpeakers[speakerId].translatedText = translatedText;
      updateTranslationsDisplay();
    }
  }
  
  // Function to finalize a speech (mark it as complete)
  async function finalizeSpeech(speakerId) {
    if (!activeSpeakers[speakerId]) return;
    
    // Get the final active utterance
    const utterance = activeSpeakers[speakerId];
    
    // If we haven't translated it yet or the translation failed, try once more
    if (!utterance.translatedText || utterance.translatedText === "...") {
      const translatedText = await translateText(speakerId, utterance.fullText);
      if (translatedText) {
        utterance.translatedText = translatedText;
      } else {
        utterance.translatedText = "Translation failed";
      }
    }
    
    // Add the finalized utterance to our list
    translatedUtterances.push({
      id: utterance.utteranceId,
      speaker: utterance.speaker,
      speakerId: speakerId,
      original: utterance.fullText,
      translated: utterance.translatedText,
      timestamp: new Date().toLocaleTimeString(),
      segments: [...utterance.segments]
    });
    
    // Mark it as inactive
    utterance.active = false;
    
    // Clear the active speaker entry
    delete activeSpeakers[speakerId];
    
    // Clear any related timers
    if (activeTimers[`finalize_${speakerId}`]) {
      clearTimeout(activeTimers[`finalize_${speakerId}`]);
      delete activeTimers[`finalize_${speakerId}`];
    }
    
    debugLog(`Finalized speech from ${utterance.speaker}: "${utterance.fullText.substring(0, 40)}..."`);
    
    // Update the display
    updateTranslationsDisplay();
  }

  // Function to update the translations display
  function updateTranslationsDisplay() {
    if (!popupWindow || popupWindow.closed) {
      openTranslationsWindow();
      return;
    }
    
    try {
      // Get the subtitles container
      const subtitlesContainer = popupWindow.document.getElementById('subtitles-container');
      
      if (!subtitlesContainer) {
        debugLog("subtitles container not found, retrying...");
        setTimeout(updateTranslationsDisplay, 100);
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
      // Try reopening it
      openTranslationsWindow();
    }
  }

  // Debounce function to limit the frequency of subtitle processing
  const DEBOUNCE_DELAY = 200; // Very responsive now
  let debounceTimer;
  function debounceProcessSubtitles() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(processSubtitles, DEBOUNCE_DELAY);
  }

  // Function to start translation
  function startTranslation() {
    if (!isTranslationActive) {
      isTranslationActive = true;
      
      debugLog(`Starting translation with input: ${inputLang}, output: ${outputLang}`);
      
      // Create a new observer if it doesn't exist
      if (!observer) {
        observer = new MutationObserver(debounceProcessSubtitles);
      }
      
      // Start observing the DOM
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false,
      });
      
      // Open the translations window
      openTranslationsWindow();
      
      // Update status in popup if it exists
      if (popupWindow && !popupWindow.closed) {
        try {
          const statusBadge = popupWindow.document.getElementById('status-badge');
          if (statusBadge) {
            statusBadge.textContent = 'Active';
            statusBadge.className = 'badge active';
          }
        } catch (e) {
          console.error("Error updating status:", e);
        }
      }
    }
  }
  
  // Function to stop translation
  function stopTranslation() {
    if (isTranslationActive) {
      isTranslationActive = false;
      
      debugLog("Stopping translation");
      
      // Disconnect the observer
      if (observer) {
        observer.disconnect();
      }
      
      // Clear all active timers
      for (const timerId in activeTimers) {
        clearTimeout(activeTimers[timerId]);
      }
      activeTimers = {};
      
      // Finalize any active speeches
      for (const speakerId in activeSpeakers) {
        finalizeSpeech(speakerId);
      }
      
      // Clear the popup check interval
      if (popupCheckInterval) {
        clearInterval(popupCheckInterval);
        popupCheckInterval = null;
      }
      
      // Update status in popup if it exists
      if (popupWindow && !popupWindow.closed) {
        try {
          const statusBadge = popupWindow.document.getElementById('status-badge');
          if (statusBadge) {
            statusBadge.textContent = 'Inactive';
            statusBadge.className = 'badge';
          }
        } catch (e) {
          console.error("Error updating status:", e);
        }
      }
    }
  }