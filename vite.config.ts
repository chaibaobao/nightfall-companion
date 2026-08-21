import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

declare const process: { env: Record<string, string | undefined> }

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1]

export default defineConfig({
  base: repository ? `/${repository}/` : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Nightfall Companion',
        short_name: 'Nightfall',
        description: '《猎巫镇》线下桌游数字主持辅助工具',
        theme_color: '#0b1117',
        background_color: '#080c10',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '.',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}']
      }
    })
  ]
})

