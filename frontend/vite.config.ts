import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// When building for Electron, VITE_BUILD_TARGET=electron is set to adjust the base path.
// The browser dev server (npm run dev) is unaffected.
const isElectronBuild = process.env.VITE_BUILD_TARGET === 'electron'
export default defineConfig({
  plugins: [react()],
  base: isElectronBuild ? './' : '/',   // './' needed for Electron file:// protocol
  server: {
    port: 3000,
    strictPort: false,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
})
