console.log("Drive Flow: Content script loaded.");

let iframe = null; // Keep iframe reference
let currentFolderIsDflow = false; // Flag to track if we are inside .dflow

// --- Initialization and Helper Functions ---

function initializeIframe() {
  if (document.getElementById('drive-flow-iframe')) {
    console.log("Drive Flow: Iframe already exists.");
    return;
  }
  console.log("Drive Flow: Creating iframe.");
  iframe = document.createElement('iframe');
  iframe.id = 'drive-flow-iframe';
  iframe.style.cssText = `
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: none; /* Ensure no border */
  z-index: 999999;
    background: transparent;
    display: none; /* Start hidden */
  `;
  if (chrome && chrome.runtime && chrome.runtime.getURL) {
      const iframeSrc = chrome.runtime.getURL('src/ui/dist/index.html');
      console.log("Drive Flow: Setting iframe src to:", iframeSrc);
      iframe.src = iframeSrc;
      document.body.appendChild(iframe);
      console.log('Drive Flow: Iframe appended to body (initially hidden).');
  } else {
      console.error("Drive Flow: Cannot create iframe, chrome.runtime.getURL is not available.");
      iframe = null;
  }
}

function getFolderIdFromUrl(url) {
  const match = url.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function toggleIframeVisibility() {
    if (currentFolderIsDflow) {
        console.log("Drive Flow: Toggle ignored, currently inside a .dflow folder.");
        return;
    }
    if (!iframe) {
        console.log("Drive Flow: Toggle requested, but iframe doesn't exist. Creating it (will be hidden initially).");
        initializeIframe();
        if (iframe) {
            iframe.style.display = 'block';
            console.log(`Drive Flow: Toggled iframe display to block`);
            // Trigger data load check *after* creating and showing iframe on first toggle
            checkUrlAndLoadData(true); // Pass flag to indicate it's from toggle
        }
    } else {
        const currentDisplay = iframe.style.display;
        iframe.style.display = currentDisplay === 'none' ? 'block' : 'none';
        console.log(`Drive Flow: Toggled iframe display to ${iframe.style.display}`);
        // If toggling to visible and nodes haven't loaded, maybe trigger load?
        // This depends on desired behavior if user navigates away then toggles back.
    }
}

// REMOVED sendMessageWithRetry function

// Main logic function
function checkUrlAndLoadData(triggeredByToggle = false) {
  const currentUrl = window.location.href;
  const folderId = getFolderIdFromUrl(currentUrl);
  // We no longer check if the folder is .dflow here, background script handles it

  if (folderId) {
    console.log(`Drive Flow: Detected folder ID: ${folderId}. Proceeding with initialization.`);
    currentFolderIsDflow = false; // Assume not .dflow initially, background will abort if needed

    // Initialize iframe if needed
    if (!iframe) {
      initializeIframe();
    } else if (!triggeredByToggle) { // Only hide if not triggered by toggle (toggle handles visibility)
       iframe.style.display = 'none';
    }

    // Request data only if iframe exists
    if (iframe) {
      // Send LOAD_FOLDER_DATA after a short delay to allow background script to potentially activate.
      // Don't await or expect a direct response.
      console.log('Drive Flow: Scheduling LOAD_FOLDER_DATA request to background (fire and forget).');
      setTimeout(() => {
          chrome.runtime.sendMessage({ type: 'LOAD_FOLDER_DATA', payload: { folderId: folderId } })
              .catch(error => {
                  // Catch potential errors if the background script connection is immediately broken
                  console.error("Drive Flow: Error sending initial LOAD_FOLDER_DATA message:", error);
                  if (iframe) iframe.style.display = 'none'; // Hide on error
              });
      }, 100); // 100ms delay
  } else {
        // This else corresponds to 'if (iframe)'
        console.warn("Drive Flow: Not requesting data because iframe failed to initialize.");
        // No need to hide iframe here as it doesn't exist
    }

  } else { // This else corresponds to 'if (folderId)'
    console.log("Drive Flow: Not currently in a recognized Google Drive folder URL.");
    currentFolderIsDflow = false; // Ensure flag is reset
    if (iframe) iframe.style.display = 'none';
  }
}

// REMOVED proceedWithInitialization function as it's merged back


// --- Global Listener Setup ---

// Listen for messages FROM the background script
if (chrome && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Drive Flow: Content script received message from background:', message.type);

    // Handle the new combined message type and older types (for potential future use/rollback)
    // Add LIST_DRIVE_FILES_RESPONSE to the list of messages to forward
    if (message.type === 'FOLDER_DATA_LOADED' || message.type === 'LOAD_SAVED_DATA' || message.type === 'DRIVE_FILES' || message.type === 'LIST_DRIVE_FILES_RESPONSE') {
       if (currentFolderIsDflow) {
            console.warn("Drive Flow: Received data but current folder is .dflow. Ignoring.");
           return false; // Important: Return false if not handling asynchronously
       }
       if (!iframe) {
           console.log("Drive Flow: Received data, creating iframe to display.");
           initializeIframe();
       }
       if (iframe) {
           iframe.style.display = 'block'; // Make sure iframe is visible
           if (iframe.contentWindow) {
               // Forward the entire message object, including potential 'error' field
               console.log('Drive Flow: Content script forwarding message to iframe:', message.type, 'Payload:', message.payload, 'Error:', message.error);
               // Adapt the message structure for the iframe listener
               iframe.contentWindow.postMessage({
                   type: 'BACKGROUND_RESPONSE', // Keep generic type for iframe listener
                   payload: { requestAction: message.type === 'LIST_DRIVE_FILES_RESPONSE' ? 'listDriveFiles' : message.type, response: message.payload, error: message.error }
               }, '*'); // Use specific origin
           } else {
               console.error('Drive Flow: Iframe exists but contentWindow not available to forward message.');
           }
       } else {
            console.error("Drive Flow: Failed to initialize iframe to display received data.");
       }
    } else if (message.type === 'DRIVE_FILES_ERROR') {
        console.error("Drive Flow: Received error from background:", message.payload);
        // Hide iframe on error?
         if(iframe) iframe.style.display = 'none';
    } else if (message.type === 'TOGGLE_IFRAME') {
      console.log('Drive Flow: Received TOGGLE_IFRAME request.');
      toggleIframeVisibility();
    } else if (message.type === 'driveFilesUpdated') {
      console.log('Drive Flow: Received driveFilesUpdated notification from background.');
      if (iframe && iframe.contentWindow) {
        console.log('Drive Flow: Forwarding driveFilesUpdated notification to iframe.');
        iframe.contentWindow.postMessage(message, '*');
      } else {
        console.warn('Drive Flow: Received driveFilesUpdated but iframe or contentWindow not available.');
      }
    }
    return false; // Indicate synchronous response or no response needed
  });
} else {
  console.error("Drive Flow: Could not add background message listener.");
}


// Listen for save requests FROM the iframe
window.addEventListener('message', (event) => {
  // Use an async IIFE to allow await inside the listener
  (async () => {
  // IMPORTANT: Add origin check in production
  // if (event.origin !== chrome.runtime.getURL('').slice(0, -1)) { // Check against extension origin
  //   console.warn("Ignoring message from unexpected origin:", event.origin);
  // }
 
  if (event.data && event.data.type === 'SAVE_FLOW_DATA') {
    console.log('Drive Flow: Received SAVE_FLOW_DATA from iframe.');
    if (currentFolderIsDflow) {
        console.error("Drive Flow: Save aborted, currently inside a .dflow folder.");
        return;
    }
    const currentFolderId = getFolderIdFromUrl(window.location.href);
    if (currentFolderId) {
        try {
             console.log(`Drive Flow: Relaying SAVE_DATA_TO_DRIVE to background for folder ${currentFolderId}.`);
             // No retry needed here? If connection fails, save just fails.
             chrome.runtime.sendMessage({
                 type: 'SAVE_DATA_TO_DRIVE',
                 payload: {
                     folderId: currentFolderId,
                     flowData: event.data.payload
                 }
             }).catch(err => console.error("Drive Flow: Error sending SAVE_DATA_TO_DRIVE to background:", err)); // Catch potential promise rejection
        } catch(error) {
             console.error("Drive Flow: Error trying to send SAVE_DATA_TO_DRIVE:", error);
        }
    } else {
      console.error("Drive Flow: Cannot save data, not in a recognized folder URL.");
    }
  } else if (event.data && event.data.type === 'RELAY_TO_BACKGROUND') { // <-- Re-add this block
    console.log('Drive Flow: Received RELAY_TO_BACKGROUND from iframe:', event.data.payload);
    // Relay the message payload to the background script.
    // No need to await or handle response here, as it comes via chrome.runtime.onMessage.
    chrome.runtime.sendMessage(event.data.payload)
      .catch(err => console.error("Drive Flow: Error sending RELAY_TO_BACKGROUND message:", err));
  }
  })(); // Immediately invoke the async IIFE
});

// --- Main Execution ---

// Initial check when the script loads
checkUrlAndLoadData();

// Google Drive uses the History API for navigation
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log(`Drive Flow: URL changed to ${url}`);
    checkUrlAndLoadData(); // Rerun the check and load logic
  }
}).observe(document.body, {subtree: true, childList: true});
