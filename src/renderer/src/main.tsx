import './assets/index.css'
import './lib/theme' // apply persisted theme before first paint

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initDesktopBridge } from './softphone/desktopBridge'

// Bridge softphone state to the OS tray + native notifications.
initDesktopBridge()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
