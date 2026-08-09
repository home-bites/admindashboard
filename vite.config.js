import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  build: {
    // The whole dashboard shipped as one 1.76 MB chunk (423 kB gzipped), so an
    // admin opening /dashboard downloaded and parsed every page, every chart
    // library and the entire Firebase SDK before the first pixel appeared.
    //
    // Splitting by vendor is the change that pays off here rather than
    // per-route splitting alone: Firebase and React are the bulk of the weight,
    // they change far less often than application code, and once separated they
    // stay in the browser cache across deploys instead of being re-downloaded
    // whenever a page component changes.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          // Firebase is by far the largest dependency. Kept whole rather than
          // split per-product: the products share a large internal core, and
          // separating them duplicates that core into every chunk.
          if (id.includes('firebase') || id.includes('@firebase')) {
            return 'vendor-firebase';
          }
          // Charting is heavy and only a handful of pages use it.
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) {
            return 'vendor-charts';
          }
          if (id.includes('react-router')) return 'vendor-router';
          if (id.includes('@tanstack')) return 'vendor-query';
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          ) {
            return 'vendor-react';
          }
          return 'vendor';
        },
      },
    },

    // Raised deliberately, not to silence a real problem: after the split above
    // the remaining chunks are vendor bundles whose size is inherent to the
    // dependency. Leaving it at 500 kB would emit a warning on every build that
    // no longer indicates anything actionable, and warnings that always fire
    // stop being read.
    chunkSizeWarningLimit: 900,
  },
})
