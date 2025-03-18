// Get references to UI elements
const inputLang = document.getElementById("inputLang");
const outputLang = document.getElementById("outputLang");
const applyButton = document.getElementById("applyButton");
const translationToggle = document.getElementById("translationToggle");
const statusMessage = document.getElementById("statusMessage");

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

// Function to check the current translation status
async function checkTranslationStatus() {
  try {
    const tab = await getActiveTab();
    
    // Inject content script if not already injected
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    
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
  chrome.storage.sync.get(["inputLang", "outputLang"], (data) => {
    if (data.inputLang) inputLang.value = data.inputLang;
    if (data.outputLang) outputLang.value = data.outputLang;
    
    // Check current translation status
    checkTranslationStatus();
  });
});

// Function to save preferences
function savePreferences() {
  const selectedInputLang = inputLang.value;
  const selectedOutputLang = outputLang.value;
  
  chrome.storage.sync.set(
    {
      inputLang: selectedInputLang,
      outputLang: selectedOutputLang,
    },
    () => {
      console.log("Preferences saved.");
    }
  );
  
  return { inputLang: selectedInputLang, outputLang: selectedOutputLang };
}

// Function to start translation
async function startTranslation(settings) {
  try {
    const tab = await getActiveTab();
    
    // Inject content script if not already injected
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    
    // Send message to content.js to start translation
    chrome.tabs.sendMessage(
      tab.id,
      {
        action: "startTranslation",
        inputLang: settings.inputLang,
        outputLang: settings.outputLang,
      },
      (response) => {
        if (response && response.status === "success") {
          console.log("Translation started successfully.");
          updateStatusUI(true);
        } else {
          console.error("Failed to start translation.");
          updateStatusUI(false);
        }
      }
    );
  } catch (error) {
    console.error("Error starting translation:", error);
    updateStatusUI(false);
  }
}

// Function to stop translation
async function stopTranslation() {
  try {
    const tab = await getActiveTab();
    
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

// Handle apply button clicks
applyButton.addEventListener("click", () => {
  const settings = savePreferences();
  
  if (translationToggle.checked) {
    // If translation is active, restart it with new settings
    startTranslation(settings);
  }
});