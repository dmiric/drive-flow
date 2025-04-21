import React, { useState, useEffect, useCallback } from 'react';
import ReactFlow, { useNodesState, useEdgesState, addEdge, Controls, Background } from 'reactflow';
import 'reactflow/dist/style.css'; // Import React Flow styles

const App = () => {
  // const [files, setFiles] = useState([]); // Will be replaced by nodes
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Add edge connection logic (optional for now)
  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  // Callback function to send data to the parent window (content script)
  const saveData = useCallback(() => {
    if (window.self !== window.top) { // Only send if in iframe
      console.log('Sending SAVE_FLOW_DATA to parent window...');
      // Create a cleaned version of nodes for saving
      const nodesToSave = nodes.map(node => ({
        id: node.id,
        data: { label: node.data.label }, // Only save the label from data
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

  useEffect(() => {
    // Function to transform files to nodes
    const transformFilesToNodes = (filesData) => {
      return filesData.map((file, index) => ({
        id: file.id,
        data: { label: file.name },
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
        // Directly set nodes and edges from saved data
        setNodes(savedData.nodes || []);
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
  }, [setNodes]); // Add setNodes to dependency array

  return (
    // Ensure the container has height for React Flow to render
    <div className="drive-flow-ui" style={{ height: '100vh', width: '100vw' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        onNodeDragStop={onNodeDragStop} // Add the drag stop handler
      >
        <Controls />
        <Background />
      </ReactFlow>
    </div>
  );
};

export default App;
