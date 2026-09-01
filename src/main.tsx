import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './components/App'
import { store } from './store'
import { requestPersistence } from './db'
import { registerServiceWorker } from './pwa/register-sw'
import { toast } from './ui/toast-store'

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Ask the browser for persistent storage; `requestPersistence` says why.
void requestPersistence()
void store.init()

registerServiceWorker({
  onUpdateReady: (apply) => toast('A new version is ready.', 'info', { label: 'Reload', run: apply }),
  onNotificationAction: (action) => {
    if (action === 'start') store.startFromNotification()
  },
})
