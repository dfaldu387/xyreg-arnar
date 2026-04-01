
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Vite configuration file
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  // esbuild: {
  //   drop: ['console', 'debugger'],
  // },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: ['pdfjs-dist', '@svar-ui/react-gantt', 'react-pdf'],
  },
  define: {
    global: 'globalThis',
  },
  assetsInclude: ['**/*.pdf'],
  worker: {
    format: 'es'
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'pdfjs': ['pdfjs-dist']
        }
      }
    }
  }
}));
