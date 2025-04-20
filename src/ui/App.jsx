import React, { useState, useEffect, useCallback } from 'react';
import ReactFlow, { useNodesState, useEdgesState, addEdge, Controls, Background } from 'reactflow';
import 'reactflow/dist/style.css'; // Import React Flow styles

const App = () => {
  // const [files, setFiles] = useState([]); // Will be replaced by nodes
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Add edge connection logic (optional for now)
  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

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
        if (event.data.type === 'DRIVE_FILES') {
          console.log('Received files from background:', event.data.payload);
          const filesData = event.data.payload || [];
          setNodes(transformFilesToNodes(filesData)); // Update nodes state
        } else if (event.data.type === 'DRIVE_FILES_ERROR') {
          console.error('Error fetching files:', event.data.payload);
          // Optionally display an error message in the UI
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
      >
        <Controls />
        <Background />
      </ReactFlow>
    </div>
  );
};

export default App;
