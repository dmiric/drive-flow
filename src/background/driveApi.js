const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'; // Define constant here
const API_COUNTER_KEY = 'driveApiRequestCount';

/**
 * Helper function to make fetch requests to Drive API, count them, and add Auth header.
 * Uses session storage for counting within a browser session.
 * @param {string} url The URL to fetch (WITHOUT access_token parameter).
 * @param {string} accessToken The Google OAuth access token.
 * @param {object} options Fetch options (method, headers, body).
 * @returns {Promise<Response>} The fetch response object.
 */
async function fetchDriveApi(url, accessToken, options = {}) {
    // Get current count from session storage
    const storageData = await chrome.storage.session.get([API_COUNTER_KEY]);
    let currentCount = storageData[API_COUNTER_KEY] || 0;

    // Increment and save count
    currentCount++;
    await chrome.storage.session.set({ [API_COUNTER_KEY]: currentCount });

    // Log the request and count
    const method = options.method || 'GET';
    console.log(`Drive API Request #${currentCount} (${method}): ${url}`); // Log URL (already without token)

    // REMOVED 10-second delay
    // console.log(`Drive API Request #${currentCount} - Waiting 10s before proceeding...`);
    // await new Promise(resolve => setTimeout(resolve, 10000));
    // console.log(`Drive API Request #${currentCount} - Proceeding after 10s delay.`);

    // Ensure headers object exists
    const fetchOptions = { ...options };
    fetchOptions.headers = { ...(fetchOptions.headers || {}) };

    // Add Authorization header
    fetchOptions.headers['Authorization'] = `Bearer ${accessToken}`;

    // Make the actual fetch call
    return fetch(url, fetchOptions);
}


/**
 * Fetches metadata for files within a specific folder.
 * @param {string} accessToken Google OAuth access token.
 * @param {string} folderId ID of the folder to list files from (or 'root').
 * @returns {Promise<Array>} A promise resolving to an array of file metadata objects.
 */
async function listFiles(accessToken, folderId = 'root') {
  try {
    const query = `'${folderId}' in parents and trashed=false`;
    const fields = 'files(id, name, mimeType)';
    const url = `${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}`; // Removed access_token
    
    // console.log(`Drive API: Listing files in folder ${folderId}`); // Logging done by fetchDriveApi
    const response = await fetchDriveApi(url, accessToken); // Pass accessToken
    const data = await response.json();

    if (response.ok && data.files) {
      console.log(`Drive API: Found ${data.files.length} files.`);
      return data.files;
    } else {
      console.error('Drive API: Failed to retrieve files:', data);
      return [];
    }
  } catch (error) {
    console.error('Drive API: Error listing files:', error);
    return [];
  }
}

/**
 * Finds a file or folder by name within a specific parent folder.
 * @param {string} accessToken Google OAuth access token.
 * @param {string} name The name of the file/folder to find.
 * @param {string} parentFolderId The ID of the folder to search within.
 * @param {string} [mimeType] Optional MIME type to filter by (e.g., 'application/vnd.google-apps.folder').
 * @returns {Promise<object|null>} A promise resolving to the file metadata object or null if not found.
 */
async function findByName(accessToken, name, parentFolderId, mimeType) {
  try {
    let query = `'${parentFolderId}' in parents and name='${name}' and trashed=false`;
    if (mimeType) {
      query += ` and mimeType='${mimeType}'`;
    }
    const fields = 'files(id, name, mimeType)';
    const url = `${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}`; // Removed access_token
    // console.log("at" + accessToken); // Removed debug log
    // console.log(`Drive API: Searching for "${name}" in folder ${parentFolderId}`); // Logging done by fetchDriveApi
    const response = await fetchDriveApi(url, accessToken); // Pass accessToken
    const data = await response.json();

    if (response.ok && data.files && data.files.length > 0) {
      console.log(`Drive API: Found "${name}" with ID: ${data.files[0].id}`);
      return data.files[0]; // Return the first match
    } else if (response.ok) {
      console.log(`Drive API: Did not find "${name}" in folder ${parentFolderId}.`);
      return null;
    } else {
      console.error(`Drive API: Error searching for "${name}":`, data);
      return null;
    }
  } catch (error) {
    console.error(`Drive API: Error searching for "${name}":`, error);
    return null;
  }
}

/**
 * Creates a new folder.
 * @param {string} accessToken Google OAuth access token.
 * @param {string} name The name for the new folder.
 * @param {string} parentFolderId The ID of the parent folder.
 * @returns {Promise<object|null>} A promise resolving to the new folder metadata object or null on failure.
 */
async function createFolder(accessToken, name, parentFolderId) {
  try {
    const metadata = {
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId]
    };
    const url = `${DRIVE_API_URL}/files`; // Removed access_token
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    };

    // console.log(`Drive API: Creating folder "${name}" in parent ${parentFolderId}`); // Logging done by fetchDriveApi
    const response = await fetchDriveApi(url, accessToken, options); // Pass accessToken
    const data = await response.json();

    if (response.ok) {
// This SEARCH block is now empty as the content was moved into the options object above.
      console.log(`Drive API: Created folder "${name}" with ID: ${data.id}`);
      return data;
    } else {
      console.error(`Drive API: Error creating folder "${name}":`, data);
      return null;
    }
  } catch (error) {
    console.error(`Drive API: Error creating folder "${name}":`, error);
    return null;
  }
}

/**
 * Creates a new file with JSON content.
 * @param {string} accessToken Google OAuth access token.
 * @param {string} name The name for the new file.
 * @param {string} parentFolderId The ID of the parent folder.
 * @param {object} jsonData The JSON data to write to the file.
 * @returns {Promise<object|null>} A promise resolving to the new file metadata object or null on failure.
 */
async function createJsonFile(accessToken, name, parentFolderId, jsonData) {
  try {
    const metadata = {
      name: name,
      mimeType: 'application/json',
      parents: [parentFolderId]
    };
    const content = JSON.stringify(jsonData, null, 2); // Pretty print JSON
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const close_delim = `\r\n--${boundary}--`;

    const body =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      content +
      close_delim;

    const url = `${DRIVE_UPLOAD_URL}/files?uploadType=multipart`; // Removed access_token
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: body
    };

    // console.log(`Drive API: Creating file "${name}" in parent ${parentFolderId}`); // Logging done by fetchDriveApi
    const response = await fetchDriveApi(url, accessToken, options); // Pass accessToken
    const data = await response.json();

    if (response.ok) {
// This SEARCH block is now empty as the content was moved into the options object above.
      console.log(`Drive API: Created file "${name}" with ID: ${data.id}`);
      return data;
    } else {
      console.error(`Drive API: Error creating file "${name}":`, data);
      return null;
    }
  } catch (error) {
    console.error(`Drive API: Error creating file "${name}":`, error);
    return null;
  }
}

/**
 * Updates an existing file with new JSON content.
 * @param {string} accessToken Google OAuth access token.
 * @param {string} fileId The ID of the file to update.
 * @param {object} jsonData The new JSON data to write to the file.
 * @returns {Promise<object|null>} A promise resolving to the updated file metadata object or null on failure.
 */
async function updateJsonFile(accessToken, fileId, jsonData) {
  try {
    const content = JSON.stringify(jsonData, null, 2); // Pretty print JSON
    const url = `${DRIVE_UPLOAD_URL}/files/${fileId}?uploadType=media`; // Removed access_token
    const options = {
      method: 'PATCH', // Use PATCH for media upload update
      headers: {
        'Content-Type': 'application/json'
      },
      body: content
    };

    // console.log(`Drive API: Updating file ID ${fileId}`); // Logging done by fetchDriveApi
    const response = await fetchDriveApi(url, accessToken, options); // Pass accessToken
    const data = await response.json();

    if (response.ok) {
// This SEARCH block is now empty as the content was moved into the options object above.
      console.log(`Drive API: Updated file ID ${fileId}`);
      return data;
    } else {
      console.error(`Drive API: Error updating file ID ${fileId}:`, data);
      return null;
    }
  } catch (error) {
    console.error(`Drive API: Error updating file ID ${fileId}:`, error);
    return null;
  }
}

/**
 * Reads and parses the JSON content of a file.
 * @param {string} accessToken Google OAuth access token.
 * @param {string} fileId The ID of the file to read.
 * @returns {Promise<object|null>} A promise resolving to the parsed JSON object or null on failure.
 */
async function readJsonFile(accessToken, fileId) {
  try {
    const url = `${DRIVE_API_URL}/files/${fileId}?alt=media`; // Removed access_token
    // console.log(`Drive API: Reading content of file ID ${fileId}`); // Logging done by fetchDriveApi
    const response = await fetchDriveApi(url, accessToken); // Pass accessToken

    if (response.ok) {
      const jsonData = await response.json(); // Directly parse response as JSON
      console.log(`Drive API: Successfully read and parsed file ID ${fileId}`);
      return jsonData;
    } else {
      const errorText = await response.text(); // Get error text for debugging
      if (response.status === 403) {
        console.warn(`Drive API: Access denied (403) reading file ID ${fileId}. Potential rate limiting. Response:`, errorText);
        return "RATE_LIMITED"; // Return specific indicator for rate limiting
      } else {
        console.error(`Drive API: Error reading file ID ${fileId} - Status ${response.status}:`, errorText);
        return null; // Return null for other errors
      }
    }
  } catch (error) {
    console.error(`Drive API: Error reading file ID ${fileId}:`, error);
    return null;
  }
}

/**
 * Gets the metadata for a specific folder.
 * @param {string} accessToken Google OAuth access token.
 * @param {string} folderId The ID of the folder to get details for.
 * @returns {Promise<object|null>} A promise resolving to the folder metadata object or null on failure.
 */
async function getFolderDetails(accessToken, folderId) {
  try {
    const fields = 'id, name, parents, mimeType'; // Include parents
    const url = `${DRIVE_API_URL}/files/${folderId}?fields=${encodeURIComponent(fields)}`; // Removed access_token
    // console.log(`Drive API: Getting details for folder ID ${folderId}. Request URL: ${url}`); // Logging done by fetchDriveApi
    const response = await fetchDriveApi(url, accessToken); // Pass accessToken
    let data;
    try {
        data = await response.json(); // Try to parse JSON even on error
    } catch (e) {
        data = await response.text(); // Fallback to text if JSON parsing fails
    }


    if (response.ok) {
      console.log(`Drive API: Successfully got details for folder ID ${folderId}:`, data.name);
      // Ensure it's actually a folder before returning
      if (data.mimeType === FOLDER_MIME_TYPE) {
          return data;
      } else {
          console.warn(`Drive API: File ID ${folderId} is not a folder (mimeType: ${data.mimeType}).`);
          return null;
      }
    } else {
      console.error(`Drive API: Error getting details for folder ID ${folderId} - Status ${response.status}. Response:`, data); // Log full error response
      return null;
    }
  } catch (error) {
    console.error(`Drive API: Error getting details for folder ID ${folderId}:`, error);
    return null;
  }
}


/**
 * Reads the raw content of a file.
 * @param {string} accessToken Google OAuth access token.
 * @param {string} fileId The ID of the file to read.
 * @returns {Promise<ArrayBuffer|null>} A promise resolving to the file content as ArrayBuffer or null on failure.
 */
async function readFileContent(accessToken, fileId) {
  try {
    const url = `${DRIVE_API_URL}/files/${fileId}?alt=media`;
    // console.log(`Drive API: Reading raw content of file ID ${fileId}`); // Logging done by fetchDriveApi
    const response = await fetchDriveApi(url, accessToken); // Pass accessToken

    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer(); // Get content as ArrayBuffer
      console.log(`Drive API: Successfully read raw content for file ID ${fileId}`);
      return arrayBuffer;
    } else {
      const errorText = await response.text(); // Get error text for debugging
      console.error(`Drive API: Error reading raw content for file ID ${fileId} - Status ${response.status}:`, errorText);
      return null; // Return null for errors
    }
  } catch (error) {
    console.error(`Drive API: Error reading raw content for file ID ${fileId}:`, error);
    return null;
  }
}

export { listFiles, findByName, createFolder, createJsonFile, updateJsonFile, readJsonFile, getFolderDetails, readFileContent }; // Added readFileContent
