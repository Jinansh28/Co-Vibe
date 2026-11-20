import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      'monaco-editor/esm/vs/editor/editor.api.js': 'monaco-editor'
    }
  },
  build: {
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('monaco-editor') || id.includes('@monaco-editor')) {
              return 'monaco-vendor';
            }
            if (id.includes('yjs') || id.includes('y-protocols') || id.includes('y-websocket')) {
              return 'collab-vendor';
            }
            if (id.includes('@supabase')) {
              return 'supabase-vendor';
            }
            if (id.includes('react') || id.includes('react-dom') || id.includes('zustand')) {
              return 'react-vendor';
            }
            return 'vendor';
          }
        }
      }
    }
  }
});


