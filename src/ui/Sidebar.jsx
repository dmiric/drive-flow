import React, { useState, useEffect, useRef } from 'react'; // <-- Add useRef here

// Accept updateCounter prop
export default function Sidebar({ onDragStart, updateCounter }) {
  const [driveFiles, setDriveFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentFolderId, setCurrentFolderId] = useState(null); // Initialize folder ID state to null
  const fetchAttemptRef = useRef(0); // Ref to track fetch attempts

  useEffect(() => {
    // Function to fetch files from the background script with retry logic
    const fetchFiles = (isRetry = false) => {
      // Use the currentFolderId from state
      const folderToFetch = currentFolderId || 'root'; // Default to 'root' if null/undefined
      // Should not happen now due to the check below, but keep for safety
      if (!folderToFetch) {
          console.warn("Sidebar: fetchFiles called with null/empty folderId. Aborting.");
          return;
      }
      fetchAttemptRef.current += 1;
      console.log(`Sidebar: fetchFiles called for folder '${folderToFetch}' (Attempt: ${fetchAttemptRef.current}).`);
      setLoading(true); // Set loading true at the start of fetch
      setError(null);

     // Send message to parent window (content script) instead of directly to background
     console.log(`Sidebar: Posting 'listDriveFiles' message to parent window (Attempt: ${fetchAttemptRef.current})`);
     window.parent.postMessage({ type: 'RELAY_TO_BACKGROUND', payload: { action: 'listDriveFiles', folderId: folderToFetch } }, '*'); // Use specific origin in production

     // NOTE: We can no longer directly use the response callback from chrome.runtime.sendMessage here.
     // The response will come back via a 'message' event from the parent window (content script).
     // We need a separate listener in App.jsx (or here) to handle the response.
     /*
      chrome.runtime.sendMessage({ action: 'listDriveFiles', folderId: 'root' }, (response) => { // OLD CODE
        console.log(`Sidebar: Received response for listDriveFiles (Attempt: ${fetchAttemptRef.current}):`, response);
        if (chrome.runtime.lastError) { // This error handling needs to move to the message listener
          console.error(`Sidebar: Error fetching Drive files (Attempt: ${fetchAttemptRef.current}):`, chrome.runtime.lastError.message); // OLD CODE
          // Check if it's a connection error and if we haven't retried yet
          if (!isRetry && chrome.runtime.lastError.message.includes('Receiving end does not exist')) {
           console.warn(`Sidebar: Connection error on attempt ${fetchAttemptRef.current}, scheduling retry...`); // <-- Modified log
           setTimeout(() => {
               console.log("Sidebar: Executing scheduled retry fetchFiles(true)..."); // <-- Add log
               fetchFiles(true);
           }, 500); // Retry after 500ms
           // Keep loading state true until retry completes or fails
           return; // Exit callback early
         } else {
           console.error(`Sidebar: Final error on attempt ${fetchAttemptRef.current} (isRetry=${isRetry}). Error: ${chrome.runtime.lastError.message}`); // <-- Add log
           // Final error (either not a connection error or retry failed)
           setError(`Connection error: ${chrome.runtime.lastError.message}. Background script might be inactive or errored.`);
           setDriveFiles([]);
           setLoading(false); // Set loading false on final error
         }
       } else if (response && response.error) {
         console.error(`Sidebar: Error from background script (Attempt: ${fetchAttemptRef.current}):`, response.error);
         setError(`API Error: ${response.error}`);
         setDriveFiles([]);
         setLoading(false); // Set loading false on API error
       } else if (response && response.files) {
         // This is the correct block for success
         console.log(`Sidebar: Successfully received files (Attempt: ${fetchAttemptRef.current}):`, response.files);
         setDriveFiles(response.files);
         setError(null); // Clear any previous error
         setLoading(false); // Set loading false on success
       } else {
         // This is the final else for invalid/unexpected response
         console.warn(`Sidebar: Received invalid or unexpected response structure (Attempt: ${fetchAttemptRef.current}).`);
         setError('Received invalid response from background script.');
         setDriveFiles([]);
         setLoading(false); // Set loading false on invalid response
       }
       // Removed duplicated blocks that were here
     }); // OLD CODE END
     */
    };

    // Fetch files whenever currentFolderId changes or updateCounter increments
    // Only fetch if we have a valid folder ID
    if (currentFolderId) {
        fetchAttemptRef.current = 0; // Reset attempt counter
        fetchFiles();
    }

    // const messageListener = (message, sender, sendResponse) => {
    //   if (message.action === 'driveFilesUpdated') {
    //     console.log('Received file update notification');
    //     fetchFiles(); // Re-fetch files on update
    //   }
    // };
    // chrome.runtime.onMessage.addListener(messageListener);

    // Cleanup listener on component unmount
    // return () => {
    //   chrome.runtime.onMessage.removeListener(messageListener);
    // };

  }, [currentFolderId, updateCounter]); // Add currentFolderId and updateCounter to dependency array

 // Effect to listen for the response from the content script
 useEffect(() => {
   const handleMessage = (event) => {
     // IMPORTANT: Add origin check in production
     // if (event.origin !== 'expected-origin') return;

     if (event.data && event.data.type === 'BACKGROUND_RESPONSE' && event.data.payload?.requestAction === 'listDriveFiles') {
       const response = event.data.payload.response;
       const error = event.data.payload.error;
       console.log(`Sidebar: Received BACKGROUND_RESPONSE for listDriveFiles:`, response, "Error:", error);

       if (error) {
         // Handle error (e.g., authentication, API error from background)
         // Note: Connection errors like "port closed" are less likely here, but handle API errors
         console.error(`Sidebar: Error from background script via content script:`, error);
         setError(`Error: ${error}`);
         setDriveFiles([]);
         setLoading(false);
       } else if (response && response.files) { // Restore original check
         // Handle success
         console.log(`Sidebar: Successfully received files via content script:`, response.files);
         setDriveFiles(response.files); // Restore setting files
         setError(null);
         setLoading(false);
       } else {
         // Handle unexpected response structure
         console.warn(`Sidebar: Received invalid response structure via content script.`);
         setError('Received invalid response from background script.');
         setDriveFiles([]);
         setLoading(false);
       }
     }
   };

   window.addEventListener('message', handleMessage);
   return () => window.removeEventListener('message', handleMessage);
 }, []); // Run only once on mount

 // Effect to listen for the CURRENT_FOLDER_ID from the content script
 useEffect(() => {
   const handleFolderIdMessage = (event) => {
     // IMPORTANT: Add origin check in production
     // if (event.origin !== 'expected-origin') return;

     if (event.data && event.data.type === 'CURRENT_FOLDER_ID') {
       const newFolderId = event.data.payload?.folderId || 'root';
       console.log(`Sidebar: Received CURRENT_FOLDER_ID: ${newFolderId}`);
       setCurrentFolderId(newFolderId); // Update state, triggering the other useEffect
     }
   };
   window.addEventListener('message', handleFolderIdMessage);
   return () => window.removeEventListener('message', handleFolderIdMessage);
 }, []); // Run only once on mount

 // Effect to notify content script that the sidebar is ready
 useEffect(() => {
   console.log("Sidebar: Component mounted, sending SIDEBAR_READY to parent.");
   window.parent.postMessage({ type: 'SIDEBAR_READY' }, '*'); // Use specific origin
   // No cleanup needed for this simple one-time message
 }, []); // Run only once on mount

  // Function to handle drag start, passing the Drive file item
  const handleDragStart = (event, file) => {
    // We need to pass enough info to identify the file and its type
    const dragData = {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      type: 'driveItem', // Add a type to distinguish from other draggable things if any
    };
    event.dataTransfer.setData('application/json', JSON.stringify(dragData));
    event.dataTransfer.effectAllowed = 'copy';
    if (onDragStart) {
        onDragStart(event, dragData); // Call original handler if needed, passing our data
    }
  };


  return (
    <aside className="sidebar">
      <div className="description">Google Drive Files:</div>
      {loading && <div className="sidebar-loading">Loading...</div>}
      {error && <div className="sidebar-error">{error}</div>}
      {!loading && !error && driveFiles.length === 0 && (
        // Update empty message to use currentFolderId
        <div className="sidebar-empty">No files or folders found in '{currentFolderId}'.</div>
      )}
      {!loading && !error && driveFiles.length > 0 && (
        driveFiles.map((file) => (
          <div
            key={file.id}
            className="sidebar-item"
            onDragStart={(event) => handleDragStart(event, file)} // Use updated handler
            draggable
          >
            {/* Basic icon logic */}
            {file.mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄'} {file.name}
          </div>
        ))
      )}
    </aside>
  );
}
