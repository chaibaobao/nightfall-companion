import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() { void updateServiceWorker(true) },
  onRegisteredSW(_swUrl, registration) {
    if (registration) window.setInterval(() => void registration.update(), 60 * 60 * 1000)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

