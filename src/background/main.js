import { getAccessToken } from './googleAuth.js';
import { listFiles } from './driveApi.js';

console.log("Background script running");

// REMOVED: Programmatic injection via tabs API (conflicts with manifest declaration)

// Print the redirect URI (useful for debugging OAuth setup)
console.log("Redirect URI:", chrome.identity.getRedirectURL());

// Listen for messages from the content script
chrome.runtime.onMessage.addListener(async (message, sender) => {
  // Handle the new message type for specific folders
  if (message.type === 'GET_SPECIFIC_DRIVE_FOLDER') {
    const folderId = message.payload?.folderId;
    if (!folderId) {
      console.error("Received GET_SPECIFIC_DRIVE_FOLDER without a folderId.");
      return false; // No async response needed
    }

    console.log(`Received request for Drive files in folder: ${folderId}`);
    const accessToken = await getAccessToken(); // This triggers auth if needed

    if (accessToken) {
      console.log("Access token obtained:", accessToken);
      // Call listFiles with the specific folderId
      const files = await listFiles(accessToken, folderId);
      console.log(`Files fetched for folder ${folderId}:`, files);

      // Send the files back to the content script that requested them
      if (sender.tab?.id) {
        // Use the same response message types
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'DRIVE_FILES',
          payload: files
        });
      } else {
        console.error("Could not get sender tab ID to send files back.");
      }
    } else {
      console.error("Failed to retrieve access token.");
      // Send an error message back to the content script
      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'DRIVE_FILES_ERROR',
          payload: 'Authentication failed.'
        });
      }
    }
    // Indicate that the response will be sent asynchronously
    return true; // Keep the message channel open for the async response
  }

  // Keep the old message handler for now? Or remove if UI is updated?
  // Let's comment it out assuming the UI will be updated.
  /*
  if (message.type === 'GET_DRIVE_FILES') {
    console.log("Received legacy request for Drive files from content script");
    const accessToken = await getAccessToken();

    if (accessToken) {
      console.log("Access token obtained:", accessToken);
      const files = await listFiles(accessToken); // Fetches root by default
      console.log("Files fetched:", files);

      // Send the files back to the content script that requested them
      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'DRIVE_FILES',
          payload: files
        });
      } else {
        console.error("Could not get sender tab ID to send files back.");
      }
    } else {
      console.error("Failed to retrieve access token.");
      // Optionally send an error message back to the content script
      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'DRIVE_FILES_ERROR',
          payload: 'Authentication failed.'
        });
      }
    }
    // Indicate that the response will be sent asynchronously
    return true;
  }
  */

  // If message type is not handled, return false or undefined
  return false;
});

// Listen for clicks on the browser action icon
chrome.action.onClicked.addListener(async (tab) => {
  // Check if the click happened on a Google Drive page
  if (tab.url && tab.url.startsWith("https://drive.google.com/")) {
    console.log("Action icon clicked on Google Drive tab:", tab.id);
    // Send a message to the content script in that tab to toggle the iframe
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_IFRAME' });
      console.log("Sent TOGGLE_IFRAME message to tab:", tab.id);
    } catch (error) {
      // This might happen if the content script isn't injected yet or the tab is protected
      console.error(`Could not send TOGGLE_IFRAME message to tab ${tab.id}:`, error.message);
      // Optional: Inject the content script programmatically if needed,
      // but it should be injected automatically based on the manifest.
    }
  } else {
    console.log("Action icon clicked on non-Google Drive tab:", tab.url);
    // Optionally open Google Drive or do nothing
  }
});
