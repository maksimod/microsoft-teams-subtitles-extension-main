// Inline Translation Display - Use direct DOM injection instead of popup
import Config from './config.js';
import { debugLog, getSpeakerId } from './utils.js';

// Keep track of inserted elements
let translationContainer = null;
let isDisplayInitialized = false;

// Track last translations for efficiency
let lastTranslations = {};

// Track accumulated translations by speaker
let accumulatedTranslations = {};

// Track display order of speakers
let speakerOrder = [];

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
      bottom: '150px',  // Position above the Teams subtitle area
      left: '20%', 
      width: '60%',
      maxHeight: '40%',
      overflowY: 'auto',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      border: '1px solid #0078d4',
      borderRadius: '6px',
      padding: '10px',
      zIndex: '9999',
      fontFamily: 'Segoe UI, Arial, sans-serif',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
      transition: 'all 0.3s ease',
      scrollBehavior: 'smooth'
    });
    
    // Create header
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '10px',
      paddingBottom: '5px',
      borderBottom: '1px solid #ddd',
      position: 'sticky',
      top: '0',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      zIndex: '1'
    });
    
    // Title
    const title = document.createElement('div');
    title.textContent = 'Live Translations';
    Object.assign(title.style, {
      fontWeight: 'bold',
      color: '#0078d4'
    });
    
    // Controls
    const controls = document.createElement('div');
    
    // Clear button
    const clearButton = document.createElement('button');
    clearButton.textContent = 'Clear';
    Object.assign(clearButton.style, {
      border: '1px solid #0078d4',
      background: 'white',
      cursor: 'pointer',
      color: '#0078d4',
      fontSize: '12px',
      padding: '2px 8px',
      borderRadius: '3px',
      marginRight: '10px'
    });
    clearButton.addEventListener('click', () => {
      // Clear all translations
      accumulatedTranslations = {};
      speakerOrder = [];
      lastTranslations = {};
      
      // Clear the content
      const contentContainer = document.getElementById('teams-subtitle-translator-content');
      if (contentContainer) {
        contentContainer.innerHTML = '';
      }
    });
    
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
    
    controls.appendChild(clearButton);
    controls.appendChild(closeButton);
    header.appendChild(title);
    header.appendChild(controls);
    translationContainer.appendChild(header);
    
    // Create content container
    const contentContainer = document.createElement('div');
    contentContainer.id = 'teams-subtitle-translator-content';
    
    // Style the content container
    Object.assign(contentContainer.style, {
      overflowY: 'auto',
      maxHeight: 'calc(100% - 40px)'
    });
    
    translationContainer.appendChild(contentContainer);
    
    // Create auto-scroll control
    const autoScrollControl = document.createElement('div');
    autoScrollControl.id = 'teams-translator-auto-scroll';
    
    // Style the auto-scroll control
    Object.assign(autoScrollControl.style, {
      position: 'absolute',
      right: '10px',
      bottom: '10px',
      display: 'flex',
      alignItems: 'center',
      padding: '5px 10px',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderRadius: '20px',
      boxShadow: '0 2px 5px rgba(0, 0, 0, 0.2)',
      zIndex: '10000',
      fontSize: '12px',
      cursor: 'pointer'
    });
    
    // Add auto-scroll checkbox
    const autoScrollLabel = document.createElement('span');
    autoScrollLabel.textContent = 'Auto-scroll';
    autoScrollLabel.style.marginRight = '5px';
    
    const autoScrollToggle = document.createElement('label');
    autoScrollToggle.className = 'toggle-switch';
    autoScrollToggle.style.display = 'inline-block';
    autoScrollToggle.style.width = '30px';
    autoScrollToggle.style.height = '16px';
    autoScrollToggle.style.position = 'relative';
    
    const autoScrollCheckbox = document.createElement('input');
    autoScrollCheckbox.id = 'teams-translator-auto-scroll-checkbox';
    autoScrollCheckbox.type = 'checkbox';
    autoScrollCheckbox.checked = true;
    autoScrollCheckbox.style.opacity = '0';
    autoScrollCheckbox.style.width = '0';
    autoScrollCheckbox.style.height = '0';
    
    const autoScrollSlider = document.createElement('span');
    autoScrollSlider.style.position = 'absolute';
    autoScrollSlider.style.cursor = 'pointer';
    autoScrollSlider.style.top = '0';
    autoScrollSlider.style.left = '0';
    autoScrollSlider.style.right = '0';
    autoScrollSlider.style.bottom = '0';
    autoScrollSlider.style.backgroundColor = '#ccc';
    autoScrollSlider.style.transition = '.4s';
    autoScrollSlider.style.borderRadius = '34px';
    
    // Create the toggle circle
    autoScrollSlider.insertAdjacentHTML('beforeend', 
      '<span style="position:absolute;content:\'\';height:12px;width:12px;left:2px;bottom:2px;background-color:white;transition:.4s;border-radius:50%;"></span>'
    );
    
    // Set up the toggle behavior
    autoScrollCheckbox.addEventListener('change', function() {
      if (this.checked) {
        autoScrollSlider.style.backgroundColor = '#0078d4';
        autoScrollSlider.querySelector('span').style.transform = 'translateX(14px)';
        
        // Scroll to bottom when enabled
        if (contentContainer) {
          contentContainer.scrollTop = contentContainer.scrollHeight;
        }
      } else {
        autoScrollSlider.style.backgroundColor = '#ccc';
        autoScrollSlider.querySelector('span').style.transform = 'translateX(0)';
      }
    });
    
    // Initial state (checked)
    autoScrollSlider.style.backgroundColor = '#0078d4';
    autoScrollSlider.querySelector('span').style.transform = 'translateX(14px)';
    
    autoScrollToggle.appendChild(autoScrollCheckbox);
    autoScrollToggle.appendChild(autoScrollSlider);
    
    autoScrollControl.appendChild(autoScrollLabel);
    autoScrollControl.appendChild(autoScrollToggle);
    
    translationContainer.appendChild(autoScrollControl);
    
    // Handle scroll events to disable auto-scroll when user scrolls up
    contentContainer.addEventListener('scroll', function() {
      const isScrolledToBottom = (contentContainer.scrollHeight - contentContainer.scrollTop - contentContainer.clientHeight) < 50;
      if (!isScrolledToBottom && autoScrollCheckbox.checked) {
        autoScrollCheckbox.checked = false;
        autoScrollSlider.style.backgroundColor = '#ccc';
        autoScrollSlider.querySelector('span').style.transform = 'translateX(0)';
      }
    });
    
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
 * Create speaker avatar
 * @param {string} speakerName - Name of the speaker
 * @param {string|null} avatarUrl - Optional URL to avatar image
 * @returns {HTMLElement} Avatar element
 */
function createSpeakerAvatar(speakerName, avatarUrl = null) {
  const avatar = document.createElement('div');
  avatar.className = 'translator-speaker-avatar';
  
  Object.assign(avatar.style, {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    marginRight: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 'bold',
    color: 'white',
    overflow: 'hidden'
  });
  
  if (avatarUrl) {
    // If we have an avatar URL, use it
    avatar.innerHTML = `<img src="${avatarUrl}" alt="${speakerName}" style="width: 100%; height: 100%; object-fit: cover;">`;
  } else {
    // Otherwise, generate a color based on name and show initials
    const nameHash = Array.from(speakerName).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const hue = nameHash % 360;
    avatar.style.backgroundColor = `hsl(${hue}, 70%, 45%)`;
    
    // Get initials (up to 2 characters)
    const initials = speakerName
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
    
    avatar.textContent = initials || '?';
  }
  
  return avatar;
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
    // Show container if it's hidden
    translationContainer.style.display = 'block';
    
    // Get content container
    const contentContainer = document.getElementById('teams-subtitle-translator-content');
    if (!contentContainer) return;
    
    // Check if auto-scroll is enabled
    const autoScrollCheckbox = document.getElementById('teams-translator-auto-scroll-checkbox');
    const shouldAutoScroll = autoScrollCheckbox && autoScrollCheckbox.checked;
    
    // Track current scroll position
    const scrollPosition = contentContainer.scrollTop;
    
    // Process finalized utterances
    for (const speakerId in translatedUtterances) {
      const utterance = translatedUtterances[speakerId];
      if (!utterance) continue;
      
      // Initialize speaker object if needed
      if (!accumulatedTranslations[speakerId]) {
        accumulatedTranslations[speakerId] = {
          speaker: utterance.speaker,
          utterances: {}
        };
        
        // Add to display order if new
        if (!speakerOrder.includes(speakerId)) {
          speakerOrder.push(speakerId);
        }
      }
      
      // Update or add the utterance
      accumulatedTranslations[speakerId].utterances[utterance.id] = {
        ...utterance,
        active: false // Finalized utterances are not active
      };
    }
    
    // Update active utterances (they may override finalized ones)
    for (const speakerId in activeSpeakers) {
      const speaker = activeSpeakers[speakerId];
      
      // Skip empty or placeholder speakers
      if (!speaker || !speaker.speaker || speaker.fullText === "") continue;
      
      // Initialize speaker object if needed
      if (!accumulatedTranslations[speakerId]) {
        accumulatedTranslations[speakerId] = {
          speaker: speaker.speaker,
          utterances: {}
        };
        
        // Add to display order if new
        if (!speakerOrder.includes(speakerId)) {
          speakerOrder.push(speakerId);
        }
      }
      
      // Update or add the active utterance
      accumulatedTranslations[speakerId].utterances[speaker.utteranceId] = {
        id: speaker.utteranceId,
        speaker: speaker.speaker,
        speakerId: speakerId,
        original: speaker.fullText,
        translated: speaker.translatedText || "Translating...",
        timestamp: new Date().toLocaleTimeString(),
        active: true,
        avatar: speaker.avatar
      };
    }
    
    // Check if we have changes compared to lastTranslations
    let hasChanges = false;
    
    // Build current translations state to compare with previous
    const currentTranslationsState = {};
    
    for (const speakerId in accumulatedTranslations) {
      currentTranslationsState[speakerId] = {};
      
      const utterances = accumulatedTranslations[speakerId].utterances;
      for (const utteranceId in utterances) {
        currentTranslationsState[speakerId][utteranceId] = {
          text: utterances[utteranceId].translated,
          active: utterances[utteranceId].active
        };
      }
    }
    
    // Compare with last state
    if (JSON.stringify(currentTranslationsState) !== JSON.stringify(lastTranslations)) {
      hasChanges = true;
      lastTranslations = JSON.parse(JSON.stringify(currentTranslationsState)); // Deep clone
    }
    
    // If no changes, don't update the DOM
    if (!hasChanges) {
      return;
    }
    
    // Clear container
    contentContainer.innerHTML = '';
    
    // Create fragment for better performance
    const fragment = document.createDocumentFragment();
    
    // Add blocks for each speaker in display order
    for (const speakerId of speakerOrder) {
      if (!accumulatedTranslations[speakerId]) continue;
      
      const speakerData = accumulatedTranslations[speakerId];
      const utterances = Object.values(speakerData.utterances);
      
      // Skip if no utterances
      if (utterances.length === 0) continue;
      
      // Sort utterances by ID (timestamp)
      utterances.sort((a, b) => a.id - b.id);
      
      // Create speaker block
      const speakerBlock = document.createElement('div');
      speakerBlock.className = 'translator-speaker-block';
      speakerBlock.dataset.speakerId = speakerId;
      
      Object.assign(speakerBlock.style, {
        marginBottom: '15px',
        borderLeft: '3px solid #0078d4',
        paddingLeft: '10px'
      });
      
      // Speaker name with avatar
      const speakerNameElem = document.createElement('div');
      
      Object.assign(speakerNameElem.style, {
        fontWeight: 'bold',
        color: '#0078d4',
        marginBottom: '5px',
        display: 'flex',
        alignItems: 'center'
      });
      
      // Add avatar
      const avatar = createSpeakerAvatar(speakerData.speaker, utterances[0].avatar);
      speakerNameElem.appendChild(avatar);
      
      // Add name text
      const nameText = document.createTextNode(speakerData.speaker);
      speakerNameElem.appendChild(nameText);
      
      speakerBlock.appendChild(speakerNameElem);
      
      // Add utterances
      for (const utterance of utterances) {
        // Utterance container
        const utteranceDiv = document.createElement('div');
        utteranceDiv.className = `translator-utterance ${utterance.active ? 'active' : ''}`;
        utteranceDiv.dataset.utteranceId = utterance.id;
        
        Object.assign(utteranceDiv.style, {
          marginBottom: '8px',
          padding: '8px',
          backgroundColor: utterance.active ? '#f0f7ff' : '#f5f5f5',
          borderRadius: '4px',
          border: utterance.active ? '1px solid #0078d4' : '1px solid #eee',
          transition: 'background-color 0.3s ease, border-color 0.3s ease'
        });
        
        // Add animation for active utterances
        if (utterance.active) {
          utteranceDiv.style.animation = 'pulse 2s infinite';
          
          // Add keyframe animation
          if (!document.getElementById('translator-keyframes')) {
            const style = document.createElement('style');
            style.id = 'translator-keyframes';
            style.textContent = `
              @keyframes pulse {
                0% { border-color: #0078d4; }
                50% { border-color: #66b0ff; }
                100% { border-color: #0078d4; }
              }
            `;
            document.head.appendChild(style);
          }
        }
        
        // Text
        const textDiv = document.createElement('div');
        textDiv.className = 'translator-text';
        textDiv.textContent = utterance.translated || "...";
        
        Object.assign(textDiv.style, {
          fontSize: '14px',
          lineHeight: '1.4'
        });
        
        utteranceDiv.appendChild(textDiv);
        
        // Timestamp
        const timeDiv = document.createElement('div');
        timeDiv.textContent = utterance.timestamp || new Date().toLocaleTimeString();
        
        Object.assign(timeDiv.style, {
          fontSize: '11px',
          color: '#888',
          textAlign: 'right',
          marginTop: '4px'
        });
        
        utteranceDiv.appendChild(timeDiv);
        speakerBlock.appendChild(utteranceDiv);
      }
      
      fragment.appendChild(speakerBlock);
    }
    
    // Add fragment to container
    contentContainer.appendChild(fragment);
    
    // Restore scroll position or auto-scroll
    if (shouldAutoScroll) {
      contentContainer.scrollTop = contentContainer.scrollHeight;
    } else {
      contentContainer.scrollTop = scrollPosition;
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
  
  // Reset accumulated translations when deactivated
  if (!isActive) {
    accumulatedTranslations = {};
    speakerOrder = [];
    lastTranslations = {};
  }
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
  
  // Clear cached data
  accumulatedTranslations = {};
  speakerOrder = [];
  lastTranslations = {};
}

export {
  initializeDisplay,
  updateDisplay,
  setDisplayStatus,
  clearDisplay
};