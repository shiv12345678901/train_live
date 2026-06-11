import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register Service Worker (feature 39/40)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failed — app still works without it
    });
  });

  // Listen for sync messages from SW
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SYNC_PENDING') {
      import('./store/appStore').then(({ useAppStore }) => {
        useAppStore.getState().syncPendingOps().catch(() => undefined);
      });
    }
  });
}
