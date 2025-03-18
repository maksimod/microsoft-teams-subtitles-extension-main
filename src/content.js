// Main content script
import Config from './config.js';
import { debugLog, clearDebugLogs } from './utils.js';
import { 
  clearTranslationTimers,
  checkApiConnection
} from './translation-service.js';
import { 
  openTranslationsWindow, 
  updateTranslationsDisplay,
  setTranslationStatus,
  stopPopupCheck,
  closePopupWindow
} from './popup-manager.js';
import {
  debounceProcessSubtitles,
  clearSubtitleData,
  getActiveSpeakers,
  getTranslatedUtterances
} from './subtitle-processor.js';

// Wrap the entire script in a self-executing function to avoid global scope pollution
(async function () {
  // Check if the script has already run
  if (window.hasTranslationScriptRun) return;
  window.hasTranslationScriptRun = true; // Mark the script as run

  // Variables to store user preferences
  let inputLang = Config.DEFAULT_INPUT_LANG;
  let outputLang = Config.DEFAULT_OUTPUT_LANG;
  let isTranslationActive = false;
  
  // Reference to the MutationObserver
  let observer = null;
  
  // Keep track of connection status
  let connectionFailed = false;
  let connectionRetryCount = 0;
  const MAX_CONNECTION_RETRIES = 3;
  
  // Expose the updateDebugLogs function to the window for use by the popup
  window.updateDebugLogs = function() {
    updateDebugLogs();
  };
  
  // Expose the clearAllTranslations function to the window for use by the popup
  window.clearAllTranslations = function() {
    clearAllTranslations();
  };
  
  // Expose isTranslationActive for popup checks
  Object.defineProperty(window, 'isTranslationActive', {
    get: function() {
      return isTranslationActive;
    }
  });

  // Function to clear all translations and associated data
  function clearAllTranslations() {
    clearSubtitleData();
    clearDebugLogs();
    clearTranslationTimers();
    
    debugLog("All translations cleared");
  }
  
  // Function to verify API key and connectivity
  async function verifyConnection() {
    try {
      debugLog("Verifying API connection...");
      
      const connectionOk = await checkApiConnection();
      
      if (!connectionOk) {
        throw new Error("API connection failed");
      }
      
      debugLog("API connection verified successfully");
      connectionFailed = false;
      connectionRetryCount = 0;
      return true;
    } catch (error) {
      console.error("API connection error:", error);
      debugLog(`API connection error: ${error.message}`);
      
      connectionFailed = true;
      connectionRetryCount++;
      
      if (connectionRetryCount >= MAX_CONNECTION_RETRIES) {
        debugLog("Max connection retries reached. Stopping translation.");
        stopTranslation();
        
        // Show alert only if we're in an active tab
        if (document.visibilityState === 'visible') {
          setTimeout(() => {
            alert("Failed to connect to translation API. Please check your API key or try again later.");
          }, 100);
        }
      }
      
      return false;
    }
  }

  // Function to start translation
  async function startTranslation() {
    if (isTranslationActive) {
      return { status: "success" };
    }
    
    // Verify API connection first
    const connectionValid = await verifyConnection();
    if (!connectionValid) {
      return { 
        status: "error", 
        message: "Failed to connect to translation API. Please check your API key or try again later."
      };
    }
    
    isTranslationActive = true;
    
    debugLog(`Starting translation with input: ${inputLang}, output: ${outputLang}`);
    
    // Create a new observer if it doesn't exist
    if (!observer) {
      observer = new MutationObserver(() => {
        debounceProcessSubtitles(isTranslationActive, inputLang, outputLang);
      });
    }
    
    // Start observing the DOM
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false,
    });
    
    // Open the translations window
    openTranslationsWindow(updateTranslationsDisplay);
    
    // Update translation status
    setTranslationStatus(true);
    
    // Add a safety check to periodically ensure everything is still working
    startSafetyChecks();
    
    return { status: "success" };
  }
  
  // Safety check timer
  let safetyCheckTimer = null;
  
  // Start periodic safety checks
  function startSafetyChecks() {
    if (safetyCheckTimer) {
      clearInterval(safetyCheckTimer);
    }
    
    safetyCheckTimer = setInterval(() => {
      if (isTranslationActive) {
        // Make sure the observer is still active
        if (observer && !observer.takeRecords) {
          debugLog("Observer appears to be inactive, reconnecting...");
          
          // Recreate the observer
          observer.disconnect();
          observer = new MutationObserver(() => {
            debounceProcessSubtitles(isTranslationActive, inputLang, outputLang);
          });
          
          // Reattach it
          observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: false,
          });
        }
        
        // Check for any recent translation failures
        if (connectionFailed) {
          // Try to reconnect
          verifyConnection();
        }
      }
    }, 30000); // Check every 30 seconds
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
      
      // Clear all translation timers
      clearTranslationTimers();
      
      // Stop popup check
      stopPopupCheck();
      
      // Stop safety checks
      if (safetyCheckTimer) {
        clearInterval(safetyCheckTimer);
        safetyCheckTimer = null;
      }
      
      // Update status in popup
      setTranslationStatus(false);
      
      return { status: "success" };
    }
    
    return { status: "error", message: "Translation not active" };
  }
  
  // Listen for messages from the popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "startTranslation") {
      // Update language settings
      inputLang = message.inputLang || Config.DEFAULT_INPUT_LANG;
      outputLang = message.outputLang || Config.DEFAULT_OUTPUT_LANG;
      
      // Start translation
      startTranslation().then(result => {
        sendResponse(result);
      }).catch(error => {
        console.error("Error starting translation:", error);
        sendResponse({ status: "error", message: error.message });
      });
      
      return true; // Indicates we'll respond asynchronously
    } else if (message.action === "stopTranslation") {
      // Stop translation
      const result = stopTranslation();
      sendResponse(result);
      return true;
    } else if (message.action === "checkStatus") {
      // Return current status
      sendResponse({
        isActive: isTranslationActive,
        inputLang: inputLang,
        outputLang: outputLang
      });
      return true;
    }
  });
  
  // Clean up when the page is unloaded
  window.addEventListener('beforeunload', () => {
    if (observer) {
      observer.disconnect();
    }
    closePopupWindow();
    clearTranslationTimers();
    
    if (safetyCheckTimer) {
      clearInterval(safetyCheckTimer);
    }
  });
  
  debugLog("Content script initialized successfully");
})();