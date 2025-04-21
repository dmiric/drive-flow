import React, { useState, useEffect, useCallback, useRef } from 'react'; // Import useRef
import ReactFlow, { useNodesState, useEdgesState, addEdge, Controls, Background } from 'reactflow';
import 'reactflow/dist/style.css'; // Import React Flow styles
import ContextMenu from './ContextMenu'; // Import the ContextMenu component

const App = () => {
  const ref = useRef(null); // Add ref for ReactFlow pane
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [menu, setMenu] = useState(null); // Add state for context menu
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Add edge connection logic (optional for now)
  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  // Callback function to send data to the parent window (content script)
  const saveData = useCallback(() => {
    if (window.self !== window.top) { // Only send if in iframe
      console.log('Sending SAVE_FLOW_DATA to parent window...');
      // Create a cleaned version of nodes for saving, including mimeType
      const nodesToSave = nodes.map(node => ({
        id: node.id,
        // Include both label and mimeType in saved data
        data: { label: node.data.label, mimeType: node.data.mimeType },
        position: node.position, // Save the current position
        // Exclude width, height, selected, positionAbsolute, dragging etc.
      }));
      const flowData = { nodes: nodesToSave, edges }; // Use cleaned nodes
      console.log('Cleaned flow data for saving:', flowData);
      window.parent.postMessage({ type: 'SAVE_FLOW_DATA', payload: flowData }, '*'); // Use specific origin in production
    }
  }, [nodes, edges]); // Depend on nodes and edges state

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

      // *** DEBUGGING: Log the mimeType being used ***
      console.log('onNodeContextMenu - Node Data:', node.data);
      console.log('onNodeContextMenu - MimeType:', node.data.mimeType);

      // Calculate position of the context menu.
      const pane = ref.current.getBoundingClientRect();
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


  useEffect(() => {
    // Function to transform files to nodes
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
    window.addEventListener('message', (event) => {
      // Basic origin check (adjust if needed for production)
      // if (event.origin !== /* expected origin */) return;

      if (event.data && event.data.type === 'LOAD_SAVED_DATA') {
        console.log('Received saved flow data:', event.data.payload);
        const savedData = event.data.payload || { nodes: [], edges: [] };
        // Explicitly map saved nodes to ensure structure, including data.mimeType
        const loadedNodes = (savedData.nodes || []).map(node => ({
          id: node.id,
          position: node.position,
          // Ensure the data object with label and mimeType is correctly formed
          data: { label: node.data?.label, mimeType: node.data?.mimeType },
          // Add other necessary React Flow node properties if needed (type, etc.)
        }));
        console.log('Processed loaded nodes:', loadedNodes); // Add log to check processed nodes
        setNodes(loadedNodes);
        setEdges(savedData.edges || []);
      } else if (event.data && event.data.type === 'DRIVE_FILES') {
        console.log('Received initial drive files list:', event.data.payload);
        const filesData = event.data.payload || [];
        // Transform raw files list into nodes, reset edges
        setNodes(transformFilesToNodes(filesData));
        setEdges([]); // Start with no edges for initial load
      } else if (event.data && event.data.type === 'DRIVE_FILES_ERROR') {
        console.error('Error loading folder data:', event.data.payload);
        // Optionally display an error message in the UI
        setNodes([]); // Clear nodes on error?
        setEdges([]);
        }
      });
      // REMOVED: Request files on mount - Now waits for content script to send data
      // console.log('Requesting files from parent window...');
      // window.parent.postMessage({ type: 'GET_DRIVE_FILES' }, '*');
    } else {
      // Not running in iframe: Use mock data for direct viewing/testing
      console.log('Not in iframe, using mock data.');
      const mockFiles = [
        { id: 'mock1', name: 'Mock File 1.txt', mimeType: 'text/plain' },
        { id: 'mock2', name: 'Mock Folder', mimeType: 'application/vnd.google-apps.folder' },
        { id: 'mock3', name: 'Mock Doc.gdoc', mimeType: 'application/vnd.google-apps.document' },
      ];
      setNodes(transformFilesToNodes(mockFiles)); // Update nodes state with mock data
    }

    // Add pane click listener to close menu
    // Note: This might interfere if ReactFlow's onPaneClick is sufficient
    // Consider removing if onPaneClick works reliably
    // document.addEventListener('click', onPaneClick);
    // return () => {
    //   document.removeEventListener('click', onPaneClick);
    // };

  }, [setNodes, setMenu]); // Add setNodes and setMenu to dependency array

  return (
    <div ref={ref} className="drive-flow-ui" style={{ height: '100vh', width: '100vw' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        ref={ref} // Assign ref
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick} // Add pane click handler
        onNodeContextMenu={onNodeContextMenu} // Add node context menu handler
      >
        <Controls />
        <Background />
      </ReactFlow>
      {menu && <ContextMenu onClick={onPaneClick} {...menu} />}
    </div>
  );
};

export default App;
