# Chrome Google Drive Flow Visualizer

## Description

This is a Chrome extension that enhances the Google Drive web interface by displaying the contents of the currently viewed folder as an interactive node-based diagram using React Flow. It allows users to visualize folder structures and provides quick actions via a context menu.

## Implemented Features

*   **Folder Visualization:** Displays files and folders from the current Google Drive folder as nodes in a React Flow diagram.
*   **Content Script Injection:** Injects an iframe containing the React Flow UI into Google Drive folder pages.
*   **Data Fetching:** Retrieves file and folder information from the Google Drive API via the extension's background script.
*   **Layout Persistence:** Saves the positions of nodes in the diagram. The layout is restored when revisiting a folder.
*   **Context Menu:** Provides a right-click context menu on nodes.
    *   **Open in Drive:** Opens the selected file or folder directly in Google Drive in a new tab.
*   **UI:** Built with React and Vite.

## Build Instructions

To build and run this extension locally:

1.  **Prerequisites:**
    *   Node.js and npm (or yarn) installed.

2.  **Install UI Dependencies:**
    *   Navigate to the UI directory:
        ```bash
        cd src/ui
        ```
    *   Install dependencies:
        ```bash
        npm install
        ```

3.  **Build the UI:**
    *   From the `src/ui` directory, run the build command:
        ```bash
        npm run build
        ```
    *   This will generate the necessary static assets in the `src/ui/dist` directory.

4.  **Load the Extension in Chrome:**
    *   Open Chrome and navigate to `chrome://extensions/`.
    *   Enable "Developer mode" (usually a toggle in the top right corner).
    *   Click "Load unpacked".
    *   Select the root directory of this project (`chrome-gdrive`).

5.  **Usage:**
    *   Navigate to a folder in Google Drive (drive.google.com). The React Flow diagram should appear in an iframe.
