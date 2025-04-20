console.log("Drive Flow: Content script loaded.");

let iframe = null; // Keep iframe reference

function initializeIframe() {
  if (document.getElementById('drive-flow-iframe')) {
    console.log("Drive Flow: Iframe already exists.");
    return; // Avoid creating multiple iframes
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
  `;
  const iframeSrc = chrome.runtime.getURL('src/ui/dist/index.html'); // Use path including src/
  console.log("Drive Flow: Setting iframe src to:", iframeSrc); // Log the generated URL
  iframe.src = iframeSrc;
  document.body.appendChild(iframe);
  console.log('Drive Flow: Iframe appended to body.');

  // Listen for messages FROM the background script (moved inside initialization)
  if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('Drive Flow: Content script received message from background:', message.type);

      if (message.type === 'DRIVE_FILES' || message.type === 'DRIVE_FILES_ERROR') {
        // Forward the response INTO the iframe
        if (iframe && iframe.contentWindow) {
          console.log('Drive Flow: Content script forwarding message to iframe:', message.type);
          iframe.contentWindow.postMessage(message, '*'); // Use specific origin target in production
        } else {
          console.error('Drive Flow: Iframe or contentWindow not available to forward message.');
        }
      } else if (message.type === 'TOGGLE_IFRAME') { // Correctly chained else if
        console.log('Drive Flow: Received TOGGLE_IFRAME request.');
        toggleIframeVisibility();
      }
      // Indicate synchronous response or no response needed
      return false; // Return false if not sending an async response
    });
  } else {
    console.error("Drive Flow: Could not add message listener, chrome.runtime or chrome.runtime.onMessage is unavailable.");
  }
}

function getFolderIdFromUrl(url) {
  // Regex to capture the folder ID from Google Drive URLs
  // Example: https://drive.google.com/drive/u/0/folders/1a2b3c4d5e...
  const match = url.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// Function to toggle iframe visibility
function toggleIframeVisibility() {
  if (!iframe) {
    // If iframe doesn't exist yet, create it first (and maybe trigger data load?)
    console.log("Drive Flow: Toggle requested, but iframe doesn't exist. Creating it.");
    // Check URL again to decide if we should load data
    checkUrlAndRequestData(); // This will create iframe and request data if in a folder
  } else {
    // If iframe exists, toggle its display
    const currentDisplay = iframe.style.display;
    iframe.style.display = currentDisplay === 'none' ? 'block' : 'none'; // Toggle display
    console.log(`Drive Flow: Toggled iframe display to ${iframe.style.display}`);
  }
}

function checkUrlAndRequestData() {
  const currentUrl = window.location.href;
  const folderId = getFolderIdFromUrl(currentUrl);

  if (folderId) {
    console.log(`Drive Flow: Detected Google Drive folder ID: ${folderId}`);
    // Ensure iframe exists before sending message
    if (!iframe) {
    initializeIframe();
    }
    // Request data for this specific folder
    if (chrome && chrome.runtime) {
      console.log('Drive Flow: Sending GET_SPECIFIC_DRIVE_FOLDER request to background.');
      chrome.runtime.sendMessage({ type: 'GET_SPECIFIC_DRIVE_FOLDER', payload: { folderId: folderId } })
        .catch(err => console.error("Drive Flow: Error sending message to background:", err));
    } else {
      console.error("Drive Flow: chrome.runtime API not available when trying to send message.");
    }
  } else {
    console.log("Drive Flow: Not currently in a recognized Google Drive folder URL.");
    // Optional: Remove or hide the iframe if not in a folder?
    // if (iframe && iframe.style.display !== 'none') { // Only hide if visible
    //   console.log("Drive Flow: Hiding iframe because not in a folder URL.");
    //   iframe.style.display = 'none';
    // }
  }
}

// --- Main Execution ---

// Initial check when the script loads
checkUrlAndRequestData();

// Google Drive uses the History API for navigation, so listen for changes
// We need a robust way to detect navigation. Using MutationObserver on title/body
// might be more reliable than just popstate or hashchange.
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log(`Drive Flow: URL changed to ${url}`);
    checkUrlAndRequestData();
  }
}).observe(document.body, {subtree: true, childList: true});


// NOTE: The iframe UI (React app) should NO LONGER send the initial 'GET_DRIVE_FILES' message.
// It should only listen for 'DRIVE_FILES' or 'DRIVE_FILES_ERROR' messages forwarded by this content script.
