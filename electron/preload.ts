import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('Electron', {
  ipcRenderer: {
    invoke: (channel: string, ...args: any[]) => {
      const validChannels = [
        'set-api-url',
        'get-api-url',
        'set-auth-data',
        'get-auth-data',
        'clear-auth-data',
        'set-device-id',
        'get-notification-preferences',
        'toggle-notification-preference',
        'get-auto-launch',
        'set-auto-launch'
      ];
      if (validChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, ...args);
      }
      throw new Error(`Unauthorized IPC channel: ${channel}`);
    },
    on: (channel: string, listener: (...args: any[]) => void) => {
      const validChannels = ['preferences-updated', 'main-process-message', 'notification-received'];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (_, ...args) => listener(...args));
      }
    },
    removeListener: (channel: string, listener: (...args: any[]) => void) => {
      ipcRenderer.removeListener(channel, listener);
    }
  }
});
