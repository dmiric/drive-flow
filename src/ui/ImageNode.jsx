import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

// memo prevents unnecessary re-renders
const ImageNode = memo(({ data, selected, isConnectable }) => {
  // Ensure data and imageUrl exist
  const imageUrl = data?.imageUrl;

  // Basic styling - adjust as needed
  const nodeStyle = {
    padding: 0, // No padding around the image itself
    border: selected ? '1px solid #777' : 'none', // Optional border on select
    borderRadius: '2px',
    background: 'transparent', // Ensure no default node background interferes
    width: 'auto', // Let image determine initial size
    height: 'auto',
    display: 'flex', // Use flex to contain image properly
    justifyContent: 'center',
    alignItems: 'center',
  };

  const imgStyle = {
    display: 'block', // Prevent extra space below image
    maxWidth: '100%', // Ensure image scales down if container is smaller
    maxHeight: '100%',
    objectFit: 'contain', // Or 'cover', 'fill', etc. depending on desired scaling
  };

  if (!imageUrl) {
    // Optional: Render a placeholder or nothing if no URL
    return <div style={{ padding: '10px', border: '1px dashed #ccc' }}>No Image URL</div>;
  }

  return (
    <div style={nodeStyle}>
      {/* Add Handles if you want to connect edges to/from the image node */}
      {/* <Handle type="target" position={Position.Top} isConnectable={isConnectable} /> */}
      <img src={imageUrl} alt="Background" style={imgStyle} />
      {/* <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} /> */}
    </div>
  );
});

export default ImageNode;