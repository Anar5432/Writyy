import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Register Offline Service Worker for 100% Offline PWA & Auto-Sync
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      console.log('Writyy Offline Service Worker registered:', registration.scope);

      // Automatically check for updates whenever internet reconnects
      window.addEventListener('online', () => {
        console.log('Internet connected: auto-checking for Writyy updates...');
        registration.update();
      });

      // Periodically check for updates if online
      setInterval(() => {
        if (navigator.onLine) {
          registration.update();
        }
      }, 60 * 1000);
    }).catch((err) => {
      console.warn('SW registration info:', err);
    });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
