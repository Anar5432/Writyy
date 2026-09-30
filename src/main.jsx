import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Register Offline Service Worker for 100% Offline PWA & Over-The-Air Updates
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      console.log('[SW] Registered successfully:', registration.scope);
      window.__WRITYY_SW_REGISTRATION__ = registration;

      const notifyUpdate = () => {
        window.dispatchEvent(new CustomEvent('writyy-update-ready', { detail: { registration } }));
      };

      // 1. If a new service worker is already waiting to activate
      if (registration.waiting) {
        notifyUpdate();
      }

      // 2. If a new service worker is currently installing
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[SW] New version ready for user installation!');
            notifyUpdate();
          }
        });
      });

      // 3. Automatically check for updates whenever internet reconnects
      window.addEventListener('online', () => {
        console.log('[SW] Online: checking for new version on cloud...');
        registration.update().catch(() => {});
      });

      // 4. Also check for updates when user returns to the app tab/screen
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          registration.update().catch(() => {});
        }
      });

      // 5. Periodic check every 60 seconds
      setInterval(() => {
        if (navigator.onLine) {
          registration.update().catch(() => {});
        }
      }, 60 * 1000);
    }).catch((err) => {
      console.warn('[SW] Registration notice:', err);
    });
  });

  // Global manual update checker function
  window.checkForWrityyUpdate = async () => {
    if (!('serviceWorker' in navigator)) return { status: 'unsupported' };
    const reg = window.__WRITYY_SW_REGISTRATION__;
    if (!reg) return { status: 'no-reg' };
    try {
      await reg.update();
      if (reg.waiting) {
        window.dispatchEvent(new CustomEvent('writyy-update-ready', { detail: { registration: reg } }));
        return { status: 'update-found' };
      }
      return { status: 'latest' };
    } catch (e) {
      return { status: 'error', error: e };
    }
  };
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
