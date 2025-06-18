"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("Electron", {
  ipcRenderer: {
    invoke: (channel, ...args) => {
      const validChannels = [
        "set-api-url",
        "get-api-url",
        "set-auth-data",
        "get-auth-data",
        "clear-auth-data",
        "set-device-id",
        "get-notification-preferences",
        "toggle-notification-preference",
        "get-auto-launch",
        "set-auto-launch"
      ];
      if (validChannels.includes(channel)) {
        return electron.ipcRenderer.invoke(channel, ...args);
      }
      throw new Error(`Unauthorized IPC channel: ${channel}`);
    },
    on: (channel, listener) => {
      const validChannels = ["preferences-updated", "main-process-message", "notification-received"];
      if (validChannels.includes(channel)) {
        electron.ipcRenderer.on(channel, (_, ...args) => listener(...args));
      }
    },
    removeListener: (channel, listener) => {
      electron.ipcRenderer.removeListener(channel, listener);
    }
  }
});
