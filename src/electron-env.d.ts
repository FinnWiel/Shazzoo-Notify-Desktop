/// <reference types="vite/client" />

interface Window {
  Electron: {
    ipcRenderer: {
      invoke(channel: string, ...args: any[]): Promise<any>;
    };
  };
} 