import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Servi sous https://skipix.github.io/murder-party/
  base: '/murder-party/',
  plugins: [react(), tailwindcss()],
})
