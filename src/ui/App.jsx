import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'; // Import useRef, useMemo
import ReactFlow, {
  useNodesState,
  useEdgesState,
  addEdge,
  Controls,
  Background,
  ReactFlowProvider, // Import ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css'; // Import React Flow styles
import ContextMenu from './ContextMenu'; // Import the ContextMenu component
import ImageNode from './ImageNode'; // Import the custom image node
import Sidebar from './Sidebar'; // Import the Sidebar component

const App = () => {
  const reactFlowWrapper = useRef(null); // Renamed ref for the wrapper div
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [menu, setMenu] = useState(null); // Add state for context menu
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState(null); // State to hold the React Flow instance
  // REMOVED: const [allDriveItems, setAllDriveItems] = useState([]);
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false); // Track initial load
  const [sidebarUpdateCounter, setSidebarUpdateCounter] = useState(0); // Counter to trigger sidebar refresh
  // REMOVED: const [backgroundImageUrl, setBackgroundImageUrl] = useState(null); // State for background image URL

  const nodeTypes = useMemo(() => ({ imageNode: ImageNode }), []); // Define custom node types


  // Add edge connection logic (optional for now)
  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  // Callback function to send data to the parent window (content script)
  // Modified to accept optional nodes/edges arguments for immediate saving after state calculation
  const saveData = useCallback((nodesToSaveArg, edgesToSaveArg) => {
    const currentNodes = nodesToSaveArg || nodes; // Use arg if provided, else state
    const currentEdges = edgesToSaveArg || edges; // Use arg if provided, else state
    if (window.self !== window.top) { // Only send if in iframe
      console.log('Sending SAVE_FLOW_DATA to parent window...');
      // Create a cleaned version of nodes for saving, including mimeType
      const nodesToSave = currentNodes.map(node => {
        // If it's the background image node, exclude the imageUrl from its data
        if (node.id === 'background-image-node') {
          const { imageUrl, ...restData } = node.data || {}; // Destructure to remove imageUrl
          // Return essential node properties + data without imageUrl
          return { id: node.id, type: node.type, position: node.position, data: restData, style: node.style, draggable: node.draggable, selectable: node.selectable };
        }
        // For other nodes, include necessary data
        return {
          id: node.id,
          data: { label: node.data?.label, mimeType: node.data?.mimeType }, // Add optional chaining
          position: node.position, // Save the current position
          // Add other relevant properties if needed, e.g., type
          type: node.type
        };
      });
      const flowData = { nodes: nodesToSave, edges: currentEdges }; // Use potentially passed edges
      console.log('Cleaned flow data for saving:', flowData);
      window.parent.postMessage({ type: 'SAVE_FLOW_DATA', payload: flowData }, '*'); // Use specific origin in production
    }
  }, [nodes, edges]); // Keep dependencies on state for fallback/other triggers

  // Handler for when a node drag stops
  const onNodeDragStop = useCallback((event, node) => {
    console.log('Node drag stopped:', node);
    saveData(); // Save data after dragging
  }, [saveData]); // Depend on the saveData callback

  // Context menu handler (Moved outside useEffect)
  const onNodeContextMenu = useCallback(
    (event, node) => {
      // Prevent native context menu from showing
      event.preventDefault();

      // Calculate position of the context menu using the correct ref
      const pane = reactFlowWrapper.current.getBoundingClientRect();
      setMenu({
        id: node.id,
        mimeType: node.data.mimeType, // Pass mimeType to menu
        top: event.clientY < pane.height - 200 ? event.clientY : undefined,
        left: event.clientX < pane.width - 200 ? event.clientX : undefined,
        right: event.clientX >= pane.width - 200 ? pane.width - event.clientX : undefined,
        bottom: event.clientY >= pane.height - 200 ? pane.height - event.clientY : undefined,
      });
    },
    [setMenu], // Dependency: setMenu
  );

  // Close the context menu if it's open whenever the window is clicked. (Moved outside useEffect)
  const onPaneClick = useCallback(() => setMenu(null), [setMenu]); // Dependency: setMenu

  // --- Drag and Drop Handlers ---
  const onDragStart = useCallback((event, itemData) => {
    // Store necessary data for the drop event
    const dataString = JSON.stringify(itemData);
    // Use application/json for data transfer as Sidebar sets it this way
    event.dataTransfer.setData('application/json', dataString);
    event.dataTransfer.effectAllowed = 'copy'; // Use 'copy' as we are creating new instances
    console.log('Drag Start from Sidebar:', itemData);
  }, []);

  const onDragOver = useCallback((event) => {
      event.preventDefault(); // Necessary to allow dropping
    event.dataTransfer.dropEffect = 'copy'; // Match effectAllowed
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      // Get data using the correct type set by Sidebar's drag handler
      const itemDataString = event.dataTransfer.getData('application/json');

      // Check if the dropped data is what we expect
      if (typeof itemDataString === 'undefined' || !itemDataString) {
        console.warn('Drop event without expected dataTransfer type.');
        return;
      }

      let itemData;
      try {
        itemData = JSON.parse(itemDataString);
      } catch (e) {
        console.error("Failed to parse dropped data:", e);
        return;
      }

      // Check if it's the type we expect from our sidebar
      if (!itemData || itemData.type !== 'driveItem') {
        console.warn('Dropped item is not of type driveItem or data is missing.');
        return;
      }

      console.log('Drop (driveItem):', itemData);

      // Check if reactFlowInstance is available
      if (!reactFlowInstance) {
        console.error('React Flow instance not available for projection.');
        return;
      }

      // Project screen position to flow position
      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      // --- Generate a unique ID for the new node ---
      // Combine original ID with timestamp for uniqueness
      const uniqueNodeId = `${itemData.id}-${Date.now()}`;

      const newNode = {
        id: uniqueNodeId, // Use the generated unique ID
        position,
        // Store original Drive ID and other info in data
        data: {
          label: itemData.name,
          mimeType: itemData.mimeType,
          driveId: itemData.id // Keep track of the original Drive item ID
        },
        // You might want to add a specific 'type' here if you have custom nodes
      };

      console.log('Creating new node:', newNode);

      // Add the new node and save
      setNodes((nds) => {
        const nextNodes = nds.concat(newNode);
        saveData(nextNodes, edges); // Pass calculated next state to saveData
        return nextNodes;
      });

    },
    [reactFlowInstance, setNodes, edges, saveData], // Add edges and saveData dependencies
  );

  // --- Node Removal Handler ---
  const handleRemoveNode = useCallback((nodeIdToRemove) => {
    setNodes((nds) => {
        const nextNodes = nds.filter(node => node.id !== nodeIdToRemove);
        saveData(nextNodes, edges); // Pass calculated next state to saveData
        return nextNodes;
    });
    console.log('Removed node:', nodeIdToRemove);
  }, [setNodes, edges, saveData]); // Add edges and saveData dependencies
  // --- End Node Removal Handler ---

  // REMOVED: Effect to save data whenever nodes or edges change *after* initial load
  // This was causing a loop: load -> setNodes -> save -> load -> ...


  // Effect to log state changes after load
  useEffect(() => {
    if (isInitialLoadComplete) {
      console.log('App State Updated - Nodes:', nodes);
      console.log('App State Updated - Edges:', edges);
    }
  }, [nodes, edges, isInitialLoadComplete]); // Log when nodes, edges, or load flag change

  // --- Effect for setting up message listener and mock data ---
  useEffect(() => {
    // Function to transform files to nodes (used only for mock data now)
    const transformFilesToNodes = (filesData) => {
      return filesData.map((file, index) => ({
        id: file.id,
        // Include mimeType in node data
        data: { label: file.name, mimeType: file.mimeType },
        position: { x: (index % 5) * 150, y: Math.floor(index / 5) * 100 }, // Basic layout
      }));
    };

    // Fetch files from background script OR use mock data
    if (window.self !== window.top) {
    // Running in iframe: Communicate with parent (content script)
    const messageListener = (event) => {
      // Basic origin check (adjust if needed for production)
      // if (event.origin !== /* expected origin */) return;

      // Log the raw event data received by App.jsx listener
      console.log('App.jsx messageListener received:', JSON.stringify(event.data));

      // Check for the generic wrapper type first
      if (event.data && event.data.type === 'BACKGROUND_RESPONSE') {
        const action = event.data.payload?.requestAction;
        const responsePayload = event.data.payload?.response; // This holds the original payload {savedData, driveFiles} or {files}
        // Note: For FOLDER_DATA_LOADED, responsePayload = {savedData: {...}, driveFiles: [...], backgroundImageDataUrl: '...'}
        const error = event.data.payload?.error;

        // Now check the nested action

        if (action === 'FOLDER_DATA_LOADED' && responsePayload) {
          console.log('Received FOLDER_DATA_LOADED via BACKGROUND_RESPONSE. Payload:', responsePayload);
          const { savedData, driveFiles, backgroundImageDataUrl } = responsePayload; // Destructure, add backgroundImageDataUrl

        // Check if savedData exists and has nodes
        if (savedData && savedData.nodes && savedData.nodes.length > 0) {
          // Saved data exists: Load nodes, edges, and all drive items for sidebar filtering
          console.log('Saved data found, loading nodes and drive items.');
          // Log the data structure before setting state
          console.log('Applying saved nodes:', JSON.stringify(savedData.nodes));
          console.log('Applying saved edges:', JSON.stringify(savedData.edges || []));
          // REMOVED: setAllDriveItems(driveFiles || []); // Sidebar fetches its own data now
          // Pass saved nodes directly, assuming structure is correct
          // console.log('Attempting to set nodes directly from saved data:', savedData.nodes); // DEBUG REMOVED
          setNodes(savedData.nodes);
          setEdges(savedData.edges || []);
        } else {
          // No saved data: Start with empty canvas
          console.log('No saved node data found, starting with empty canvas.');
          // REMOVED: setAllDriveItems([]);
          setNodes([]);
          setEdges([]);
        }
        // Background image node data is now handled within setNodes/setEdges
        // console.log('Setting background image URL state:', backgroundImageDataUrl); // Removed state setter
        // setBackgroundImageUrl(backgroundImageDataUrl); // Removed state setter

        setIsInitialLoadComplete(true); // Mark load complete after processing data

        } else if (action === 'LIST_DRIVE_FILES_RESPONSE' && error) { // Check for error from listDriveFiles
          console.error('Error listing sidebar files:', error);
          // Handle sidebar specific error if needed, maybe show in sidebar component?
        } else if (action === 'DRIVE_FILES_ERROR' && error) { // Check action and error field from FOLDER_DATA_LOADED
          console.error('Error loading folder data:', error);
        // REMOVED: setAllDriveItems([]); // Clear items on error
        setNodes([]);         // Clear nodes
        setEdges([]);         // Clear edges
        setIsInitialLoadComplete(true); // Mark load complete even on error
        // Optionally display an error message in the UI?
        } else if (action === 'driveFilesUpdated') { // Check action
          console.log('App.jsx received driveFilesUpdated notification.');
          // Increment the counter to trigger sidebar refresh
          setSidebarUpdateCounter(count => count + 1);
        }
      } // End of check for BACKGROUND_RESPONSE type
      };
    window.addEventListener('message', messageListener);
      // REMOVED: Request files on mount - Now waits for content script to send data
    } else {
      // Not running in iframe: Use mock data for direct viewing/testing
      console.log('Not in iframe, using mock data.');
      const mockFiles = [
        { id: 'mock1', name: 'Mock File 1.txt', mimeType: 'text/plain' },
        { id: 'mock2', name: 'Mock Folder', mimeType: 'application/vnd.google-apps.folder' },
        { id: 'mock3', name: 'Mock Doc.gdoc', mimeType: 'application/vnd.google-apps.document' },
      ];
      // REMOVED: setAllDriveItems(mockFiles);
      // Still set mock nodes for direct viewing if needed
      setNodes(transformFilesToNodes(mockFiles));
      setIsInitialLoadComplete(true); // Mark complete for mock data
    }

    // Cleanup listener on unmount
    return () => {
      if (window.self !== window.top) {
        window.removeEventListener('message', messageListener);
      }
    };

    // Add pane click listener to close menu (Keep this) - Belongs in its own effect? No, fine here.
    // Note: This might interfere if ReactFlow's onPaneClick is sufficient
    // Consider removing if onPaneClick works reliably
    // document.addEventListener('click', onPaneClick);
    // return () => {
    //   document.removeEventListener('click', onPaneClick);
    // };

  // Dependencies for the mount/listener effect - should be empty to run only once
  }, []); // Empty array ensures this runs only on mount/unmount


  // REMOVED: const sidebarItems = useMemo(...)


  return (
    <div className="dnd-flow"> {/* New wrapper class for layout */}
      <ReactFlowProvider> {/* Wrap with provider for useReactFlow hook */}
        {/* Pass the update counter to Sidebar */}
        <Sidebar onDragStart={onDragStart} updateCounter={sidebarUpdateCounter} /> {/* Add Sidebar */}
        <div className="react-flow-wrapper" ref={reactFlowWrapper} style={{ height: '100%', width: '100%' }}> {/* Wrapper for drop - REMOVED background style */}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            // ref prop is not needed when using ReactFlowProvider and useReactFlow hook
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance} // Capture instance on init
            onDrop={onDrop} // Add drop handler
            nodeTypes={nodeTypes} // Pass custom node types
            onDragOver={onDragOver} // Add drag over handler
            fitView
            onNodeDragStop={onNodeDragStop}
            onPaneClick={onPaneClick}
            onNodeContextMenu={onNodeContextMenu}
          >
            <Controls />
            <Background />
          </ReactFlow>
        </div>
        {menu && <ContextMenu onClick={onPaneClick} onRemoveNode={handleRemoveNode} {...menu} />} {/* Pass handleRemoveNode */}
      </ReactFlowProvider>
    </div>
  );
};

export default App;
