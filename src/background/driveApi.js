async function listFiles(accessToken, folderId = 'root') {
  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false&fields=files(id, name, mimeType)&access_token=${accessToken}`);
    const data = await response.json();

    if (data.files) {
      return data.files;
    } else {
      console.error('Failed to retrieve files:', data);
      return [];
    }
  } catch (error) {
    console.error('Error listing files:', error);
    return [];
  }
}

export { listFiles };
