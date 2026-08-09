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
    // Firebase and the charting libraries are separated because they are large
    // and they are *leaves*: they do not import anything else in the bundle, so
    // pulling them out cannot create a dependency cycle. Everything else stays
    // together in one bucket.
    //
    // An earlier version of this config split react / react-dom / router /
    // query into their own chunks and produced:
    //
    //     Circular chunk: vendor -> vendor-react -> vendor
    //
    // React's ecosystem is densely interdependent — routers, state libraries
    // and hook utilities import React, and React's own chunk pulls in shared
    // helpers that landed in the catch-all. Cutting through that graph makes
    // two chunks that each need the other before either can evaluate. Grouping
    // them keeps the boundary along a real seam instead of through the middle
    // of one.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          // Largest dependency by far, and a true leaf. Kept whole rather than
          // split per-product: the Firebase products share a substantial
          // internal core, and separating them duplicates that core into every
          // resulting chunk.
          if (id.includes('firebase') || id.includes('@firebase')) {
            return 'vendor-firebase';
          }

          // Heavy, and only a few pages render charts.
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) {
            return 'vendor-charts';
          }

          // React and everything that depends on it, together. This is the
          // chunk whose contents change least often, so it stays cached across
          // deploys while application code churns.
          return 'vendor-core';
        },
      },
    },

    // Raised deliberately, not to silence a real problem: the remaining large
    // chunks are vendor bundles whose size is inherent to the dependency. Left
    // at 500 kB this would warn on every build about something that is not
    // actionable, and a warning that always fires stops being read.
    chunkSizeWarningLimit: 900,
  },
})
