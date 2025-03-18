// Get references to UI elements
const inputLang = document.getElementById("inputLang");
const outputLang = document.getElementById("outputLang");
const startButton = document.getElementById("startButton");

// Load saved preferences
chrome.storage.sync.get(["inputLang", "outputLang"], (data) => {
  if (data.inputLang) inputLang.value = data.inputLang;
  if (data.outputLang) outputLang.value = data.outputLang;
});

// Save preferences and start translation
startButton.addEventListener("click", async () => {
  const selectedInputLang = inputLang.value;
  const selectedOutputLang = outputLang.value;

  // Save preferences
  chrome.storage.sync.set(
    {
      inputLang: selectedInputLang,
      outputLang: selectedOutputLang,
    },
    () => {
      console.log("Preferences saved.");
    }
  );

  // Get the active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Inject content.js into the active tab
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
  });

  // Send message to content.js to start translation
  chrome.tabs.sendMessage(
    tab.id,
    {
      action: "startTranslation",
      inputLang: selectedInputLang,
      outputLang: selectedOutputLang,
    },
    (response) => {
      if (response && response.status === "success") {
        console.log("Translation started successfully.");
      } else {
        console.error("Failed to start translation.");
      }
    }
  );
});