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


// Listen for messages from UI scripts or content scripts
// Make the listener async
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log("BG Listener: Received message:", JSON.stringify(message), "from:", sender?.tab?.id ?? sender?.id); // <-- Add log here

  // Handle request from Sidebar to list files
  if (message.action === 'listDriveFiles') {
    const folderId = message.folderId || 'root'; // Default to root if not specified
    console.log(`BG: Received listDriveFiles for folder: ${folderId}`); // <-- Modified log
    // No need to explicitly return true here because the listener is async.
    // We are now using chrome.tabs.sendMessage instead of sendResponse for this handler.

    // --- Restore Async Logic ---
    try { // Add top-level try block for this specific handler
      // console.log("BG: Attempting to get access token..."); // Log removed for brevity
      console.log("BG: listDriveFiles - Before getAccessToken await"); // <-- Add log
      const accessToken = await getAccessToken();
      if (!accessToken) {
        console.error("Cannot list files: Failed to retrieve access token.");
        console.log("BG: Failed to get access token."); // <-- Add log
        sendResponse({ error: 'Authentication failed.' });
        return; // Exit async handler block
      }

      console.log("BG: listDriveFiles - After getAccessToken await"); // <-- Add log
      // Call the existing listFiles function
      console.log(`BG: Got token, attempting listFiles for folder ${folderId}...`); // <-- Add log
      console.log("BG: listDriveFiles - Before listFiles await"); // <-- Add log
      const files = await listFiles(accessToken, folderId);
      console.log("BG: listDriveFiles - After listFiles await"); // <-- Add log
      console.log(`BG: listFiles returned. Found ${files?.length ?? 'undefined/null'} files/folders in ${folderId}.`); // <-- Add log
      // Filter out the .dflow folder itself from the list sent to the UI
      // Although maybe the sidebar *should* see it? Let's keep it for now.
      // const filteredFiles = files.filter(file => !(file.name === DFLOW_FOLDER_NAME && file.mimeType === FOLDER_MIME_TYPE));
      // console.log("BG: Sending successful file list response to UI."); // <-- Add log
      // console.log("BG: listDriveFiles - Before sendResponse (success)"); // <-- Add log
      // Clean the files array to prevent serialization issues
      const cleanedFiles = files?.map(file => ({ // Add optional chaining for safety
        id: file.id,
        name: file.name,
        mimeType: file.mimeType
      })) || []; // Default to empty array if files is null/undefined
      // console.log("BG: Sending cleaned file list response to UI."); // <-- Modified log
      // console.log("BG: listDriveFiles - Before sendResponse (success)"); // <-- Add log
      // Send response back to the specific content script tab using chrome.tabs.sendMessage
      if (sender.tab?.id) {
        console.log(`BG: Sending LIST_DRIVE_FILES_RESPONSE to tab ${sender.tab?.id}`);
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'LIST_DRIVE_FILES_RESPONSE',
          payload: { files: cleanedFiles }
        });
      } else {
        console.error("BG: Cannot send LIST_DRIVE_FILES_RESPONSE, sender tab ID is missing.");
      }
    } catch (error) {
      console.error(`BG: Error caught during listFiles process for folder ${folderId}:`, error); // <-- Add log
      console.error(`Error listing files for folder ${folderId}:`, error);
      // Send error back to the specific content script tab using chrome.tabs.sendMessage
      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'LIST_DRIVE_FILES_RESPONSE', // Use same type for consistency
          error: `API error listing files: ${error.message || error}`
        });
      }
    } // --- End Async Logic ---
    // Note: sendResponse is called within the try/catch, return true happened earlier

  } // End if (message.action === 'listDriveFiles')

  // REMOVED GET_FOLDER_DETAILS handler block (This comment might be outdated, check context)

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

      // 4. Always list files in the target folder
      console.log(`Listing files in target folder: ${folderId}`);
      const allFiles = await listFiles(accessToken, folderId);
      // Filter out the .dflow folder itself from the list sent to the UI
      const filteredFiles = allFiles.filter(file => !(file.name === DFLOW_FOLDER_NAME && file.mimeType === FOLDER_MIME_TYPE));
      console.log(`Found ${allFiles.length} total items, preparing ${filteredFiles.length} items (excluding .dflow)`);

      // 5. Combine saved data and file list into a single payload
      const combinedPayload = {
          savedData: savedFlowData || { nodes: [], edges: [] }, // Use default if null
          driveFiles: filteredFiles
      };

      // 6. Send the combined data in a single message
      console.log("Sending FOLDER_DATA_LOADED to content script.");
      if (sender.tab?.id) {
          chrome.tabs.sendMessage(sender.tab.id, { type: 'FOLDER_DATA_LOADED', payload: combinedPayload });
      }

      // 7. Handle initial save if no data file was found initially (still needed)
      if (!dataFileFound) {
          console.log("No data file found, attempting synchronous initial save...");
          const initialFlowData = { nodes: [], edges: [] }; // Start empty on canvas
          const saveSuccess = await saveDataFile(accessToken, folderId, initialFlowData);
          if (saveSuccess) {
              console.log("Synchronous initial save completed successfully.");
          } else {
              console.error("Synchronous initial save failed.");
          }
      }

    } catch (error) {
      console.error("Error during load data process:", error);
      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, { type: 'DRIVE_FILES_ERROR', payload: 'Error loading folder data.' });
      }
    }
}
// End Temporarily disabled LOAD_FOLDER_DATA // Restored

// Handle saving data to Drive
// Temporarily disabled to isolate listDriveFiles // Restored
else if (message.type === 'SAVE_DATA_TO_DRIVE') {
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
    const saveSuccess = await saveDataFile(accessToken, folderId, flowData);

    // After saving, re-list files and send back to UI to update sidebar
    if (saveSuccess && sender.tab?.id) {
        console.log(`Save successful for ${folderId}, re-listing files...`);
        try {
            // Re-list files
            const allFiles = await listFiles(accessToken, folderId);
            const filteredFiles = allFiles.filter(file => !(file.name === DFLOW_FOLDER_NAME && file.mimeType === FOLDER_MIME_TYPE));

            // Re-read the saved data (which was just updated)
            // Need to find the .dflow folder and data.json file again
            let latestSavedData = null;
            const dflowFolder = await findByName(accessToken, DFLOW_FOLDER_NAME, folderId, FOLDER_MIME_TYPE);
            if (dflowFolder?.id) {
                const dataFile = await findByName(accessToken, DATA_FILE_NAME, dflowFolder.id, JSON_MIME_TYPE);
                if (dataFile?.id) {
                    latestSavedData = await readJsonFile(accessToken, dataFile.id);
                    if (latestSavedData === "RATE_LIMITED") {
                         console.warn(`Post-save: Aborting update send for folder ${folderId} due to potential rate limiting during readJsonFile.`);
                         latestSavedData = null; // Don't send rate limit error to UI here
                    }
                }
            }

            // Combine and send FOLDER_DATA_LOADED
            const combinedPayload = {
                savedData: latestSavedData || { nodes: [], edges: [] }, // Use default if re-read failed
                driveFiles: filteredFiles
            };
            console.log(`Sending updated FOLDER_DATA_LOADED after save.`);
            chrome.tabs.sendMessage(sender.tab.id, { type: 'FOLDER_DATA_LOADED', payload: combinedPayload });

            // Also send a specific message to trigger sidebar refresh
            console.log(`Sending driveFilesUpdated notification to tab ${sender.tab.id}`);
            chrome.tabs.sendMessage(sender.tab.id, { type: 'driveFilesUpdated', payload: { folderId: folderId } });

        } catch (listError) {
            console.error(`Error re-listing files after save for folder ${folderId}:`, listError);
            // Optionally send an error back? For now, just log.
        }
    } else if (!saveSuccess) {
         console.error(`Save failed for folder ${folderId}, not re-listing files or sending update.`);
    }

  }
  // End Temporarily disabled SAVE_DATA_TO_DRIVE // Restored
  // Temporarily disabled to isolate listDriveFiles // Restored
  else if (message.type === 'REVOKE_AUTH_TOKEN') {
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
  // End Temporarily disabled REVOKE_AUTH_TOKEN // Restored
  // Add other message handlers here if needed (like LOAD_FOLDER_DATA, SAVE_DATA_TO_DRIVE etc.)


  // IMPORTANT: If the message wasn't handled by a block that uses sendResponse (and returned true),
  // the listener will implicitly return undefined, which is correct.
  // Other handlers like LOAD_FOLDER_DATA use chrome.tabs.sendMessage and don't need to return true.
}); // End addListener

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
