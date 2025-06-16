import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'


const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error('Failed to find root element');
} else {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  } catch (error) {
    console.error('Failed to mount React app:', error);
  }
}

// Use contextBridge
window.Electron.ipcRenderer.on('main-process-message', (message) => {
  // console.log(message)
})
