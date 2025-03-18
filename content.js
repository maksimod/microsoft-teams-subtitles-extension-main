  // Wrap the entire script in a self-executing function to avoid global scope pollution
(function () {
  // Check if the script has already run
  if (window.hasTranslationScriptRun) return;
  window.hasTranslationScriptRun = true; // Mark the script as run

  // OpenAI API key (hardcoded for testing)
  const OPENAI_API_KEY = "YOUR_KEY";

  // Debounce delay to ensure DOM stability
  const DEBOUNCE_DELAY = 1500;

  // Variables to store user preferences
  let inputLang = "auto";
  let outputLang = "en";
  let isTranslationActive = false;

  // Reference to the popup window
  let popupWindow = null;

  // Function to open the translations window
  function openTranslationsWindow() {
    if (!popupWindow || popupWindow.closed) {
      // Create a new popup window if it doesn't exist or is closed
      popupWindow = window.open("", "TranslatedSubtitles", "width=400,height=300");
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
                padding: 10px;
              }
              #subtitles {
                white-space: pre-line;
              }
            </style>
          </head>
          <body>
            <h3>Translated Subtitles</h3>
            <div id="subtitles">Waiting for subtitles...</div>
          </body>
          </html>
        `);

        // Ensure the popup window's DOM is fully loaded before updating
        popupWindow.document.close();
        console.log("Popup window opened successfully.");
      } else {
        console.error("Popup window was blocked. Please allow popups for this site.");
      }
    }
  }

  // Function to translate text using OpenAI API
  async function translateText(text) {
    try {
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
              content: `Translate the following text from ${inputLang} to ${outputLang}: ${text}`,
            },
          ],
        }),
      });

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error("Translation error:", error);
      return null;
    }
  }

  // Function to detect and process subtitles
  async function processSubtitles() {
    if (!isTranslationActive) {
      console.log("Translation is not active. Skipping subtitle processing.");
      return;
    }

    console.log("Processing subtitles...");

    // Select all subtitle containers
    const subtitleContainers = document.querySelectorAll(
      'span[dir="auto"][data-tid="closed-caption-text"]'
    );

    if (subtitleContainers.length === 0) {
      console.log("No subtitle containers found.");
      return;
    }

    // Array to store translated subtitles
    let translatedSubtitles = [];

    // Use a for...of loop to handle async/await properly
    for (const container of subtitleContainers) {
      const text = container.innerText.trim();
      if (text) {
        console.log("Detected subtitle:", text);

        // Translate the subtitle
        const translatedText = await translateText(text);
        if (translatedText) {
          console.log("Translated subtitle:", translatedText);
          translatedSubtitles.push(translatedText);
        }
      }
    }

    // Display translated subtitles in the popup window
    if (translatedSubtitles.length > 0) {
      console.log("Updating popup window with translated subtitles.");
      updatePopupWindow(translatedSubtitles.join("<br>"));
    } else {
      console.log("No subtitles to translate.");
    }
  }

  // Function to update the popup window with translated subtitles
  function updatePopupWindow(content) {
    console.log("Attempting to update popup window with content:", content);
    if (popupWindow && !popupWindow.closed) {
      try {
        // Ensure the popup window's DOM is accessible
        const subtitlesDiv = popupWindow.document.getElementById("subtitles");
        if (subtitlesDiv) {
          subtitlesDiv.innerHTML = content;
          console.log("Popup window updated successfully.");
        } else {
          console.error("Subtitles div not found in the popup window.");
        }
      } catch (error) {
        console.error("Error updating popup window:", error);
      }
    } else {
      console.error("Popup window is not open or has been closed.");
    }
  }

  // Debounce function to limit the frequency of subtitle processing
  let debounceTimer;
  function debounceProcessSubtitles() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(processSubtitles, DEBOUNCE_DELAY);
  }

  // Observe DOM changes to detect new subtitles
  const observer = new MutationObserver(debounceProcessSubtitles);

  // Listen for messages from popup.js
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startTranslation") {
      inputLang = request.inputLang;
      outputLang = request.outputLang;
      isTranslationActive = true;

      // Start observing the DOM
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false,
      });

      console.log("Translation started with input:", inputLang, "output:", outputLang);
      sendResponse({ status: "success" }); // Respond to the popup
    }
    return true; // Required to use sendResponse asynchronously
  });

  // Open the translations window automatically when the script loads
  openTranslationsWindow();

  console.log("Teams Live Subtitle Translator extension loaded.");
})();