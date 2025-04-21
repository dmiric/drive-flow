import { getAccessToken } from './googleAuth.js';
import {
  listFiles,
  findByName,
  createFolder,
  createJsonFile,
  updateJsonFile,
  readJsonFile,
  getFolderDetails // Import the new function
} from './driveApi.js';

console.log("Background script running");

// Constants
const DFLOW_FOLDER_NAME = '.dflow';
const DATA_FILE_NAME = 'data.json';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const JSON_MIME_TYPE = 'application/json';

// Helper function to convert Drive files list to initial React Flow nodes
function transformFilesToFlowData(files) {
  const nodes = files.map((file, index) => ({
    id: file.id,
    data: { label: file.name },
    position: { x: (index % 8) * 150, y: Math.floor(index / 8) * 100 },
    type: 'default',
  }));
  const edges = [];
  return { nodes, edges };
}

// Helper function to handle the save operation (used by both initial save and updates)
// More robust check for folder existence before creation.
async function saveDataFile(accessToken, parentFolderId, flowData) {
  console.log(`Attempting to save data in folder: ${parentFolderId}`);
  let dflowFolder = null;
  let dflowFolderId = null;

  try {
    // --- Step 0: Check if parent folder itself is '.dflow' ---
    // This check should ideally happen in the content script before even sending SAVE_DATA_TO_DRIVE
    // but we add a safeguard here.
    const parentDetails = await getFolderDetails(accessToken, parentFolderId);
    // --- Step 0a: Check if parent folder is valid/accessible ---
    if (!parentDetails) {
        console.error(`Save aborted: Parent folder ID ${parentFolderId} is invalid or inaccessible.`);
        return false; // Indicate failure: parent folder doesn't exist or no permissions
    }
    // --- Step 0b: Check if parent folder itself is '.dflow' ---
    if (parentDetails.name === DFLOW_FOLDER_NAME) {
        console.error(`Save aborted: Cannot save inside a "${DFLOW_FOLDER_NAME}" folder.`);
        return false; // Indicate failure: saving inside .dflow is forbidden
    }

    // --- Step 1: Find or Create .dflow Folder ---
    console.log(`Searching for folder "${DFLOW_FOLDER_NAME}" in parent ${parentFolderId}`);
    dflowFolder = await findByName(accessToken, DFLOW_FOLDER_NAME, parentFolderId, FOLDER_MIME_TYPE);

    if (dflowFolder && dflowFolder.id) {
      console.log(`Found existing "${DFLOW_FOLDER_NAME}" folder with ID: ${dflowFolder.id}`);
      dflowFolderId = dflowFolder.id;
    } else {
      console.log(`"${DFLOW_FOLDER_NAME}" not found initially. Attempting to create...`);
      try {
        dflowFolder = await createFolder(accessToken, DFLOW_FOLDER_NAME, parentFolderId);
        if (dflowFolder && dflowFolder.id) {
          console.log(`Successfully created "${DFLOW_FOLDER_NAME}" folder with ID: ${dflowFolder.id}`);
          dflowFolderId = dflowFolder.id;
        } else {
          console.warn(`Creation of "${DFLOW_FOLDER_NAME}" returned null/invalid. Retrying find...`);
          dflowFolder = await findByName(accessToken, DFLOW_FOLDER_NAME, parentFolderId, FOLDER_MIME_TYPE);
          if (dflowFolder && dflowFolder.id) {
            console.log(`Found "${DFLOW_FOLDER_NAME}" folder on second attempt (ID: ${dflowFolder.id})`);
            dflowFolderId = dflowFolder.id;
          } else {
            throw new Error(`Failed to create or find the "${DFLOW_FOLDER_NAME}" folder after retry.`);
          }
        }
      } catch (creationError) {
         console.error(`Error during folder creation attempt: ${creationError}`);
         console.log(`Retrying find after creation error...`);
         dflowFolder = await findByName(accessToken, DFLOW_FOLDER_NAME, parentFolderId, FOLDER_MIME_TYPE);
          if (dflowFolder && dflowFolder.id) {
            console.log(`Found "${DFLOW_FOLDER_NAME}" folder after creation error (ID: ${dflowFolder.id})`);
            dflowFolderId = dflowFolder.id;
          } else {
             throw new Error(`Failed to create or find the "${DFLOW_FOLDER_NAME}" folder. Error: ${creationError.message}`);
          }
      }
    }

    // --- Step 2: Find or Create data.json within .dflow Folder ---
    if (!dflowFolderId) {
        throw new Error("Could not determine .dflow folder ID.");
    }

    console.log(`Searching for file "${DATA_FILE_NAME}" in parent ${dflowFolderId}`);
    let existingDataFile = await findByName(accessToken, DATA_FILE_NAME, dflowFolderId, JSON_MIME_TYPE);
    let dataFileId = existingDataFile?.id;

    if (dataFileId) {
      // --- Step 3a: Update Existing data.json ---
      console.log(`Found existing "${DATA_FILE_NAME}" (ID: ${dataFileId}). Updating it...`);
      const updateResult = await updateJsonFile(accessToken, dataFileId, flowData);
      if (!updateResult) {
          console.warn(`Update failed for "${DATA_FILE_NAME}" (ID: ${dataFileId}). File might have been deleted.`);
      } else {
          console.log(`Successfully updated "${DATA_FILE_NAME}".`);
      }
    } else {
      // --- Step 3b: Create New data.json ---
      console.log(`"${DATA_FILE_NAME}" not found. Creating it...`);
      const newDataFile = await createJsonFile(accessToken, DATA_FILE_NAME, dflowFolderId, flowData);
      if (!newDataFile || !newDataFile.id) {
        console.warn(`Creation of "${DATA_FILE_NAME}" failed. Retrying find...`);
        existingDataFile = await findByName(accessToken, DATA_FILE_NAME, dflowFolderId, JSON_MIME_TYPE);
        if (existingDataFile && existingDataFile.id) {
             console.log(`Found "${DATA_FILE_NAME}" on second attempt (ID: ${existingDataFile.id}). Attempting update instead...`);
             await updateJsonFile(accessToken, existingDataFile.id, flowData);
             console.log(`Successfully updated "${DATA_FILE_NAME}" after finding it post-creation-failure.`);
        } else {
            throw new Error(`Failed to create or find "${DATA_FILE_NAME}" file after retry.`);
        }
      } else {
          console.log(`Successfully created "${DATA_FILE_NAME}" with ID: ${newDataFile.id}`);
      }
    }

    console.log("Save data operation completed successfully.");
    return true; // Indicate success

  } catch (error) {
    console.error("Error during saveDataFile process:", error);
    return false; // Indicate failure
  }
}


// Listen for messages from the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Return true ONLY if sendResponse will be used asynchronously.
  let isAsync = false; // Default to false

  (async () => { // Use IIFE for async operations
    try { // Add top-level try block
      // REMOVED GET_FOLDER_DETAILS handler block

      // Handle loading data for a specific folder
      if (message.type === 'LOAD_FOLDER_DATA') {
          // isAsync = true; // Removed: This handler uses chrome.tabs.sendMessage, not sendResponse
          const folderId = message.payload?.folderId;
        if (!folderId) {
          console.error("Received LOAD_FOLDER_DATA without a folderId.");
          // No sendResponse needed here as content script doesn't wait for this one
          return;
        }

        console.log(`Received request to load data for folder: ${folderId}`);
        const accessToken = await getAccessToken();

        if (!accessToken) {
          console.error("Cannot load data: Failed to retrieve access token.");
          if (sender.tab?.id) {
            chrome.tabs.sendMessage(sender.tab.id, { type: 'DRIVE_FILES_ERROR', payload: 'Authentication failed.' });
          }
          return;
        }

        let savedFlowData = null;
        let dataFileFound = false;

        try {
          // 0. Validate the folderId itself before proceeding
          console.log(`Validating initial folder ID: ${folderId}`);
          const folderDetails = await getFolderDetails(accessToken, folderId);
          if (!folderDetails) {
              console.error(`LOAD_FOLDER_DATA: Initial folder ID ${folderId} is invalid or inaccessible. Aborting load.`);
              if (sender.tab?.id) {
                // Optionally inform the content script
                chrome.tabs.sendMessage(sender.tab.id, { type: 'DRIVE_FILES_ERROR', payload: 'Current Google Drive folder is inaccessible or invalid.' });
              }
              return; // Stop processing for this folder
          }
          // --- Step 0b: Check if the validated folder itself is '.dflow' ---
          if (folderDetails.name === DFLOW_FOLDER_NAME) {
              console.error(`LOAD_FOLDER_DATA: Attempted to load data inside a "${DFLOW_FOLDER_NAME}" folder (${folderId}). Aborting.`);
              // Optionally send an error message back? For now, just aborting.
              // if (sender.tab?.id) {
              //   chrome.tabs.sendMessage(sender.tab.id, { type: 'DRIVE_FILES_ERROR', payload: 'Cannot initialize Drive Flow inside a .dflow folder.' });
              // }
              return; // Stop processing
          }
          console.log(`Initial folder ID ${folderId} is valid and not '.dflow' (${folderDetails.name}). Proceeding...`);

          // 1. Look for .dflow folder
          console.log(`Searching for folder "${DFLOW_FOLDER_NAME}" in parent ${folderId}`);
          const dflowFolder = await findByName(accessToken, DFLOW_FOLDER_NAME, folderId, FOLDER_MIME_TYPE);

          if (dflowFolder && dflowFolder.id) {
             console.log(`Found existing "${DFLOW_FOLDER_NAME}" folder with ID: ${dflowFolder.id}`);
            // 2. Look for data.json inside .dflow
             console.log(`Searching for file "${DATA_FILE_NAME}" in parent ${dflowFolder.id}`);
            const dataFile = await findByName(accessToken, DATA_FILE_NAME, dflowFolder.id, JSON_MIME_TYPE);
            if (dataFile && dataFile.id) {
               console.log(`Found existing "${DATA_FILE_NAME}" (ID: ${dataFile.id}). Reading it...`);
              // 3. Read data.json
              savedFlowData = await readJsonFile(accessToken, dataFile.id);
              // Check the result of readJsonFile
              if (savedFlowData === "RATE_LIMITED") {
                  console.warn(`LOAD_FOLDER_DATA: Aborting load for folder ${folderId} due to potential rate limiting during readJsonFile.`);
                  // Optionally inform the user via content script?
                  // if (sender.tab?.id) {
                  //   chrome.tabs.sendMessage(sender.tab.id, { type: 'DRIVE_FILES_ERROR', payload: 'Could not load saved layout due to Google Drive rate limiting. Please try again later.' });
                  // }
                  return; // Stop processing this load request
              } else if (savedFlowData) {
                  // Successfully read data (and not rate limited)
                  dataFileFound = true;
                  console.log("Successfully read saved flow data.");
              } else {
                  // readJsonFile returned null (genuine error or empty file)
                  console.error(`Failed to read content of "${DATA_FILE_NAME}" (ID: ${dataFile.id}).`);
              }
            } else {
               console.log(`Did not find "${DATA_FILE_NAME}" in folder ${dflowFolder.id}.`);
            }
          } else {
             console.log(`Did not find "${DFLOW_FOLDER_NAME}" folder in ${folderId}.`);
          }

          // 4. Decide what data to send back
          if (dataFileFound && savedFlowData) {
            // Send saved data if successfully found and read
            console.log("Sending LOAD_SAVED_DATA to content script.");
            if (sender.tab?.id) {
              chrome.tabs.sendMessage(sender.tab.id, { type: 'LOAD_SAVED_DATA', payload: savedFlowData });
            }
          } else {
            // Load initial folder contents if data.json wasn't found/read
            console.log("Loading initial folder contents as fallback...");
            const initialFiles = await listFiles(accessToken, folderId);
            // Filter out the .dflow folder itself from the initial list
            const filteredFiles = initialFiles.filter(file => !(file.name === DFLOW_FOLDER_NAME && file.mimeType === FOLDER_MIME_TYPE));

            console.log(`Sending initial DRIVE_FILES (${filteredFiles.length} items) to content script.`);
            if (sender.tab?.id) {
              // IMPORTANT: Attempt to save this initial state *before* sending to UI
              const initialFlowData = transformFilesToFlowData(filteredFiles);
              console.log("Attempting synchronous initial save...");
              const saveSuccess = await saveDataFile(accessToken, folderId, initialFlowData);
              if (saveSuccess) {
                  console.log("Synchronous initial save completed successfully.");
              } else {
                  console.error("Synchronous initial save failed. Proceeding without saved state.");
                  // Decide if we should still send DRIVE_FILES or an error?
                  // Let's still send DRIVE_FILES for now, but the state won't persist on next load.
              }

              // Now send the initial files to the content script
              console.log(`Sending initial DRIVE_FILES (${filteredFiles.length} items) to content script.`);
              chrome.tabs.sendMessage(sender.tab.id, { type: 'DRIVE_FILES', payload: filteredFiles });

            }
          } // End of 'else' block (initial load/fallback)

        } catch (error) {
          console.error("Error during load data process:", error);
          if (sender.tab?.id) {
            chrome.tabs.sendMessage(sender.tab.id, { type: 'DRIVE_FILES_ERROR', payload: 'Error loading folder data.' });
          }
        }

    // Handle saving data to Drive
    } else if (message.type === 'SAVE_DATA_TO_DRIVE') {
        // isAsync = true; // Removed: No response needed for this message type
        const { folderId, flowData } = message.payload;
        if (!folderId || !flowData) {
          console.error("Received SAVE_DATA_TO_DRIVE without folderId or flowData.");
          return;
        }

        const accessToken = await getAccessToken();
        if (!accessToken) {
          console.error("Cannot save data: Failed to retrieve access token.");
          return;
        }

        // Call the refactored save function
          await saveDataFile(accessToken, folderId, flowData);
      } else if (message.type === 'REVOKE_AUTH_TOKEN') {
          console.log("Received REVOKE_AUTH_TOKEN request.");
          try {
              // First, get the current token without interaction
              const currentToken = await chrome.identity.getAuthToken({ interactive: false });
              if (currentToken && currentToken.token) {
                  console.log("Attempting to remove cached token...");
                  await chrome.identity.removeCachedAuthToken({ token: currentToken.token });
                  console.log("Cached token removed successfully. Next auth attempt will be interactive.");
              } else {
                  console.log("No cached token found to remove.");
              }
          } catch (err) {
              console.error("Error during token revocation:", err);
          }
      }
      // Add other message handlers here if needed

    } catch (error) { // Add top-level catch block
        console.error("Unhandled error in background message listener IIFE:", error);
      // We don't know if sendResponse is expected here, so just log.
    }
  })(); // Immediately invoke the async function

  // Return true ONLY if a handler above set isAsync = true (currently none do)
  return isAsync;
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
      console.error(`Could not send TOGGLE_IFRAME message to tab ${tab.id}:`, error.message);
    }
  } else {
    console.log("Action icon clicked on non-Google Drive tab:", tab.url);
  }
});
