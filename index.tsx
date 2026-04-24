
// Manejo global de errores de carga dinámica (import())
window.addEventListener('error', (event) => {
  if (event?.message?.includes('Failed to fetch dynamically imported module')) {
    console.warn('[CHUNK LOAD ERROR] forcing reload');
    window.location.reload();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  if (event?.reason?.message?.includes('Failed to fetch dynamically imported module')) {
    console.warn('[CHUNK LOAD ERROR - PROMISE] forcing reload');
    window.location.reload();
  }
});

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
