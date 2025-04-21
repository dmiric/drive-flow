import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '', // Ensure relative paths for assets
  css: {
    modules: {
      localsConvention: 'camelCase'
    }
  },
  resolve: {
    alias: {
      'react': path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
      'reactflow': path.resolve(__dirname, './node_modules/reactflow')
    }
  },
  build: {
    outDir: './dist',
     emptyOutDir: true,
     target: 'es2020',
     // base: '', // Remove base setting, let Vite default to relative?
     modulePreload: { polyfill: false },
     rollupOptions: {
      input: './index.html', // Use index.html as the entry point
      output: {
        entryFileNames: 'assets/index.js', // Match the script tag in index.html
        assetFileNames: 'assets/[name].[ext]',
        // Let Vite determine the best format (usually 'es' for modern targets)
        // Remove format, name, inlineDynamicImports, globals for standard app build
      }
    }
  }
})
