import React, { useCallback } from 'react';

export default function ContextMenu({
  id,
  mimeType,
  top,
  left,
  right,
  bottom,
  onClick, // Function to close the menu
  onRemoveNode, // Function to remove the node
  ...props
}) {
  const handleOpenInDrive = useCallback(() => {
    let url;
    if (mimeType === 'application/vnd.google-apps.folder') {
      // Try alternative folder URL format including user index
      url = `https://drive.google.com/drive/u/0/folders/${id}`;
    } else {
      // Default to file view URL for other types
      url = `https://drive.google.com/file/d/${id}/view`;
    }
    console.log(`Opening ${mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file'} in Drive: ${url}`);
    window.open(url, '_blank', 'noopener,noreferrer');
    onClick(); // Close the menu after clicking
  }, [id, mimeType, onClick]);

  const handleRemoveNode = useCallback(() => {
    if (onRemoveNode) {
      onRemoveNode(id); // Call the remove function with the node ID
    }
    onClick(); // Close the menu
  }, [id, onRemoveNode, onClick]);

  return (
    <div
      style={{ top, left, right, bottom }}
      className="context-menu"
      {...props}
    >
      <button onClick={handleOpenInDrive}>Open in Drive</button>
      <button onClick={handleRemoveNode}>Remove Node</button>
      {/* Add other menu items here if needed */}
    </div>
  );
}
