import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: {
    // Railway serves the app behind its own *.up.railway.app domain (and any
    // custom domain you add). Vite's preview server blocks unknown hosts by
    // default, so allow them here. The app ships no secrets, so this is safe.
    host: true,
    allowedHosts: true,
  },
})
