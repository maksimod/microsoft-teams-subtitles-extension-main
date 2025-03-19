// Get references to UI elements
const inputLang = document.getElementById("inputLang");
const outputLang = document.getElementById("outputLang");
const applyButton = document.getElementById("applyButton");
const translationToggle = document.getElementById("translationToggle");
const statusMessage = document.getElementById("statusMessage");
const displayModeRadios = document.querySelectorAll('input[name="displayMode"]');

// Function to update the UI based on the translation status
function updateStatusUI(isActive) {
  translationToggle.checked = isActive;
  
  if (isActive) {
    statusMessage.textContent = "Translation is ON";
    statusMessage.className = "status active";
  } else {
    statusMessage.textContent = "Translation is OFF";
    statusMessage.className = "status inactive";
  }
}

// Function to get the active tab
async function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]);
    });
  });
}

// Function to focus the Teams tab and bring the popup on top
async function focusTeamsTab() {
  try {
    const tab = await getActiveTab();
    if (tab) {
      // Focus the tab first
      chrome.tabs.update(tab.id, { active: true });
      
      // Force the popup window to appear on top if possible
      const views = chrome.extension.getViews({ type: "popup" });
      if (views && views.length > 0) {
        views[0].focus();
      }
    }
  } catch (error) {
    console.error("Error focusing tab:", error);
  }
}

// Function to get the selected display mode
function getSelectedDisplayMode() {
  for (const radio of displayModeRadios) {
    if (radio.checked) {
      return radio.value;
    }
  }
  return 'popup'; // Default to popup if somehow nothing is selected
}

// Function to set the display mode in the UI
function setDisplayMode(mode) {
  for (const radio of displayModeRadios) {
    if (radio.value === mode) {
      radio.checked = true;
      break;
    }
  }
}

// Function to check the current translation status
async function checkTranslationStatus() {
  try {
    const tab = await getActiveTab();
    if (!tab) return;
    
    // Make sure we're on a Teams page
    if (!tab.url || !tab.url.includes("teams.microsoft.com")) {
      updateStatusUI(false);
      statusMessage.textContent = "Please open Microsoft Teams";
      return;
    }
    
    // Inject content script if not already injected
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
    } catch (error) {
      console.error("Error injecting content script:", error);
      // Continue anyway as the script might already be injected
    }
    
    // Ask content.js for current status
    chrome.tabs.sendMessage(
      tab.id,
      { action: "checkStatus" },
      (response) => {
        if (response) {
          // Update UI based on current status
          updateStatusUI(response.isActive);
          
          // Update language selections if available
          if (response.inputLang) inputLang.value = response.inputLang;
          if (response.outputLang) outputLang.value = response.outputLang;
          
          // Update display mode if available
          if (response.displayMode) setDisplayMode(response.displayMode);
        } else {
          // No response, assume not active
          updateStatusUI(false);
        }
      }
    );
  } catch (error) {
    console.error("Error checking translation status:", error);
    updateStatusUI(false);
  }
}

// Load saved preferences and check current status when popup opens
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get(["inputLang", "outputLang", "displayMode"], (data) => {
    if (data.inputLang) inputLang.value = data.inputLang;
    if (data.outputLang) outputLang.value = data.outputLang;
    if (data.displayMode) setDisplayMode(data.displayMode);
    
    // Check current translation status
    checkTranslationStatus();
  });
  
  // Add version info
  const manifestData = chrome.runtime.getManifest();
  const versionInfo = document.createElement('div');
  versionInfo.textContent = `v${manifestData.version}`;
  versionInfo.style.position = 'absolute';
  versionInfo.style.bottom = '5px';
  versionInfo.style.right = '5px';
  versionInfo.style.fontSize = '10px';
  versionInfo.style.color = '#888';
  document.body.appendChild(versionInfo);
});

// Function to save preferences
function savePreferences() {
  const selectedInputLang = inputLang.value;
  const selectedOutputLang = outputLang.value;
  const selectedDisplayMode = getSelectedDisplayMode();
  
  chrome.storage.sync.set(
    {
      inputLang: selectedInputLang,
      outputLang: selectedOutputLang,
      displayMode: selectedDisplayMode
    },
    () => {
      console.log("Preferences saved.");
      showFeedback("Settings saved!");
    }
  );
  
  return { 
    inputLang: selectedInputLang, 
    outputLang: selectedOutputLang,
    displayMode: selectedDisplayMode
  };
}

// Function to show feedback message
function showFeedback(message) {
  const savedFeedback = document.createElement('div');
  savedFeedback.textContent = message;
  savedFeedback.style.position = "absolute";
  savedFeedback.style.bottom = "40px";
  savedFeedback.style.left = "50%";
  savedFeedback.style.transform = "translateX(-50%)";
  savedFeedback.style.backgroundColor = "#4CAF50";
  savedFeedback.style.color = "white";
  savedFeedback.style.padding = "5px 10px";
  savedFeedback.style.borderRadius = "4px";
  savedFeedback.style.zIndex = "1000";
  savedFeedback.style.opacity = "0";
  savedFeedback.style.transition = "opacity 0.3s ease";
  
  document.body.appendChild(savedFeedback);
  
  // Fade in
  setTimeout(() => {
    savedFeedback.style.opacity = "1";
  }, 10);
  
  // Fade out and remove
  setTimeout(() => {
    savedFeedback.style.opacity = "0";
    setTimeout(() => {
      document.body.removeChild(savedFeedback);
    }, 300);
  }, 2000);
}

// Function to start translation
async function startTranslation(settings) {
  try {
    const tab = await getActiveTab();
    if (!tab) return;
    
    // Make sure we're on a Teams page
    if (!tab.url || !tab.url.includes("teams.microsoft.com")) {
      showFeedback("Please open Microsoft Teams");
      updateStatusUI(false);
      return;
    }
    
    // Inject content script if not already injected
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
    } catch (error) {
      console.error("Error injecting content script:", error);
      // Continue anyway as the script might already be injected
    }
    
    // Send message to content.js to start translation
    chrome.tabs.sendMessage(
      tab.id,
      {
        action: "startTranslation",
        inputLang: settings.inputLang,
        outputLang: settings.outputLang,
        displayMode: settings.displayMode
      },
      (response) => {
        if (response && response.status === "success") {
          console.log("Translation started successfully.");
          updateStatusUI(true);
        } else {
          console.error("Failed to start translation.");
          updateStatusUI(false);
          
          // Show error message
          if (response && response.message) {
            showFeedback(`Error: ${response.message}`);
          }
        }
      }
    );
  } catch (error) {
    console.error("Error starting translation:", error);
    updateStatusUI(false);
    showFeedback("Error starting translation");
  }
}

// Function to update display mode without restarting translation
async function updateDisplayMode(displayMode) {
  try {
    const tab = await getActiveTab();
    
    // Send message to content.js to update display mode
    chrome.tabs.sendMessage(
      tab.id,
      {
        action: "setDisplayMode",
        displayMode: displayMode
      },
      (response) => {
        if (!response || response.status !== "success") {
          console.error("Failed to update display mode.");
        }
      }
    );
  } catch (error) {
    console.error("Error updating display mode:", error);
  }
}

// Function to stop translation
async function stopTranslation() {
  try {
    const tab = await getActiveTab();
    if (!tab) return;
    
    // Send message to content.js to stop translation
    chrome.tabs.sendMessage(
      tab.id,
      { action: "stopTranslation" },
      (response) => {
        if (response && response.status === "success") {
          console.log("Translation stopped successfully.");
          updateStatusUI(false);
        } else {
          console.error("Failed to stop translation.");
        }
      }
    );
  } catch (error) {
    console.error("Error stopping translation:", error);
  }
}

// Handle toggle switch changes
translationToggle.addEventListener("change", () => {
  if (translationToggle.checked) {
    const settings = savePreferences();
    startTranslation(settings);
  } else {
    stopTranslation();
  }
});

// Handle display mode changes
for (const radio of displayModeRadios) {
  radio.addEventListener("change", () => {
    if (translationToggle.checked) {
      // If translation is already active, update the display mode without restarting
      updateDisplayMode(getSelectedDisplayMode());
    }
  });
}

// Handle apply button clicks
applyButton.addEventListener("click", () => {
  const settings = savePreferences();
  
  // Ensure popup stays on top by focusing the tab first, then the popup
  focusTeamsTab();
  
  if (translationToggle.checked) {
    // If translation is active, restart it with new settings
    startTranslation(settings);
  }
  
  // Add a subtle animation to the button to provide feedback
  applyButton.style.transition = "transform 0.2s ease";
  applyButton.style.transform = "scale(0.95)";
  
  setTimeout(() => {
    applyButton.style.transform = "scale(1)";
  }, 200);
});
