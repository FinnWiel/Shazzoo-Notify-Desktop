import { app, BrowserWindow, Menu, ipcMain, Tray, nativeImage, Notification } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'path';
import Store from 'electron-store';
import crypto from 'crypto';
import fs from 'fs';
import Pusher from 'pusher-js';
import axios from 'axios';
// @ts-ignore
import AutoLaunch from 'auto-launch';

let isQuitting = false;

// Determine __dirname safely in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine dev mode
const isDev = !app.isPackaged;

// Proper APP_ROOT depending on dev or production
const APP_ROOT = isDev ? path.join(__dirname, '..') : path.join(process.resourcesPath, 'app.asar');
const RENDERER_DIST = isDev ? path.join(APP_ROOT, 'dist') : path.join(APP_ROOT, 'dist');

process.env.APP_ROOT = APP_ROOT;
process.env.VITE_PUBLIC = isDev ? path.join(APP_ROOT, 'public') : RENDERER_DIST;

const notificationIcon = process.platform === 'win32'
  ? path.resolve(process.env.VITE_PUBLIC!, 'logo.ico')
  : path.resolve(process.env.VITE_PUBLIC!, 'logo.png');


let win: BrowserWindow | null = null;
let tray: Tray | null = null;8
let pusherClient: Pusher | null = null;
let websocketInitializing = false;

const autoLauncher = new AutoLaunch({
  name: 'Shazzoo Mobile',
  path: app.getPath('exe'),
  isHidden: true
});

app.setAppUserModelId('Shazzoo Notify');

const getOrCreateEncryptionKey = () => {
  const keyPath = path.join(app.getPath('userData'), 'encryption-key');
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf8');
  }
  const key = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(keyPath, key);
  return key;
};

const store = new Store({
  encryptionKey: getOrCreateEncryptionKey(),
  name: 'secure-config',
  clearInvalidConfig: true,
  watch: true
});

function getDeviceId(): string | null {
  const deviceIdPath = path.join(app.getPath('userData'), 'device-id');
  if (fs.existsSync(deviceIdPath)) {
    return fs.readFileSync(deviceIdPath, 'utf8');
  }
  return null;
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC!, 'logo.png'),
    minWidth: 500,
    minHeight: 500,
    width: 650,
    height: 950,
    resizable: true,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    const indexPath = path.join(RENDERER_DIST, 'index.html');
    console.log('Loading index.html from:', indexPath);
    console.log('File exists:', fs.existsSync(indexPath));
    win.loadFile(indexPath).catch(err => {
      console.error('Failed to load index.html:', err);
    });
  }

  // Open DevTools after a short delay
  setTimeout(() => {
    win?.webContents.openDevTools();
  }, 1000);

  win.webContents.on('did-fail-load', (errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString());
  });

  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win?.hide();
    }
  });

  return win;
}

async function getNotificationPreferences() {
  const token = store.get('authToken');
  const apiUrl = store.get('apiUrl');
  const deviceId = getDeviceId();

  if (!token || !apiUrl || !deviceId) {
    console.error('WebSocket: Missing credentials for preferences');
    return {};
  }

  try {
    const response = await fetch(`${apiUrl}/api/notification-preferences`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Device-Token': deviceId
      }
    });

    if (!response.ok) throw new Error('Failed to fetch preferences');
    return await response.json();
  } catch (error) {
    console.error('WebSocket: Fetch error:', error);
    return {};
  }
}

async function toggleNotificationPreference(key: string) {
  const token = store.get('authToken');
  const apiUrl = store.get('apiUrl');
  const deviceId = getDeviceId();
  if (!token || !apiUrl || !deviceId) return {};

  try {
    const currentPreferences = await getNotificationPreferences();
    const updated = { [key]: !currentPreferences[key] };

    const response = await fetch(`${apiUrl}/api/notification-preferences`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Device-Token': deviceId
      },
      body: JSON.stringify(updated)
    });

    if (!response.ok) throw new Error('Failed to update preferences');
    const data = await response.json();

    if (pusherClient) {
      const channelName = `notifications.${key}`;
      if (!updated[key]) {
        console.log(`WebSocket: Unsubscribing from ${channelName}`);
        pusherClient.unsubscribe(channelName);
      } else {
        console.log(`WebSocket: Subscribing to ${channelName}`);
        const channel = pusherClient.subscribe(channelName);
        channel.bind(`${key}.notification`, (data: any) => {
          console.log('WebSocket: Received notification:', data);
          try {
            const notification = new Notification({
              title: data.title || 'Shazzoo Mobile',
              body: data.data || 'You have a new notification',
              icon: notificationIcon,
              silent: false
            });

            notification.show();

            notification.on('click', () => {
              if (win) {
                win.show();
                win.focus();
              }
            });
          } catch (error) {
            console.error('WebSocket: Failed to create notification:', error);
          }
        });
      }
    }

    const newPreferences = await getNotificationPreferences();
    updateTrayMenu(newPreferences);
    win?.webContents.send('preferences-updated');
    return data;
  } catch (error) {
    console.error('WebSocket: Error updating preferences:', error);
    return {};
  }
}
function getTrayIconPath() {
  const assetName = process.platform === 'darwin'
    ? 'tray-icon-mac.png'  // macOS: monochrome
    : 'tray-icon.png';     // Windows/Linux: full color

  if (isDev) {
    return path.resolve(__dirname, `../src/assets/${assetName}`);
  } else {
    return path.join(process.resourcesPath, 'assets', assetName);
  }
}

async function createTray() {
  if (!tray) {
    const iconPath = getTrayIconPath();
    const trayIcon = nativeImage.createFromPath(iconPath);
    tray = new Tray(trayIcon);
  }

  const token = store.get('authToken');
  if (!token) {
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open App', click: () => { win?.show(); win?.focus(); } },
      { type: 'separator' },
      { label: 'Please login', enabled: false },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ]);
    tray.setContextMenu(contextMenu);
    return;
  }

  try {
    const preferences = await getNotificationPreferences();
    updateTrayMenu(preferences);
  } catch (error) {
    console.error('Failed to get notification preferences for tray:', error);
    // Fallback to basic menu if preferences can't be loaded
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open App', click: () => { win?.show(); win?.focus(); } },
      { type: 'separator' },
      { label: 'Failed to load preferences', enabled: false },
      { type: 'separator' },
      { label: 'Quit', click: () => { tray?.destroy(); app.quit(); }}
    ]);
    tray.setContextMenu(contextMenu);
  }
}

function updateTrayMenu(preferences: any) {
  if (!tray) {
    console.warn('Tray not initialized, cannot update menu');
    return;
  }

  // Handle empty or undefined preferences
  if (!preferences || Object.keys(preferences).length === 0) {
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open App', click: () => { win?.show(); win?.focus(); } },
      { type: 'separator' },
      { label: 'No notification preferences available', enabled: false },
      { type: 'separator' },
      { label: 'Quit', click: () => { tray?.destroy(); app.quit(); }}
    ]);
    tray.setContextMenu(contextMenu);
    return;
  }

  const preferenceItems = Object.entries(preferences).map(([key, value]) => ({
    label: key,
    type: 'checkbox' as const,
    checked: Boolean(value),
    click: () => {
      toggleNotificationPreference(key).then(async () => {
        const updatedPreferences = await getNotificationPreferences();
        updateTrayMenu(updatedPreferences);
      }).catch(err => console.error(err));
    }
  }));

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open App', click: () => { win?.show(); win?.focus(); } },
    { type: 'separator' },
    ...preferenceItems,
    { type: 'separator' },
    { label: 'Quit', click: () => { tray?.destroy(); app.quit(); }}
  ]);

  tray.setContextMenu(contextMenu);
}

async function initializeWebSocket() {
  if (websocketInitializing) {
    console.log('WebSocket: Already initializing, skipping...');
    return;
  }

  websocketInitializing = true;

  try {
    const token = store.get('authToken');
    const apiUrl = store.get('apiUrl');
    
    if (!token || !apiUrl) {
      console.error('WebSocket: Missing credentials');
      return;
    }

    if (pusherClient) {
      console.log('WebSocket: Cleaning up existing Pusher connection');
      pusherClient.disconnect();
      pusherClient = null;
    }

    console.log('WebSocket: Fetching configuration...');
    const response = await axios.get(`${apiUrl}/api/websocket-config`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const config = response.data;

    pusherClient = new Pusher(config.pusherKey, {
      wsHost: config.wsHost,
      wsPort: config.wsPort,
      forceTLS: config.forceTLS,
      enabledTransports: ['ws', 'wss'],
      disableStats: true,
      cluster: 'mt1'
    });

    const preferences = await getNotificationPreferences();

    for (const [type, enabled] of Object.entries(preferences)) {
      if (!enabled) continue;

      const channelName = `notifications.${type}`;
      const channel = pusherClient.subscribe(channelName);
      channel.bind(`${type}.notification`, (data: any) => {
        const notification = new Notification({
          title: data.title || 'Shazzoo Mobile',
          body: data.data || 'You have a new notification',
          icon: notificationIcon,
          silent: false
        });

        notification.show();
        notification.on('click', () => {
          if (win) {
            win.show();
            win.focus();
          }
        });
      });
    }

    // Update tray menu with current preferences
    updateTrayMenu(preferences);

  } catch (error) {
    console.error('WebSocket: Initialization failed:', error);
  } finally {
    websocketInitializing = false;
  }
}

app.whenReady().then(async () => {
  // Configure cache directory
  const userDataPath = app.getPath('userData');
  const cachePath = path.join(userDataPath, 'Cache');
  
  // Ensure cache directory exists
  if (!fs.existsSync(cachePath)) {
    try {
      fs.mkdirSync(cachePath, { recursive: true });
    } catch (error) {
      console.error('Failed to create cache directory:', error);
    }
  }

  // Set cache directory
  app.setPath('userData', userDataPath);
  app.setPath('cache', cachePath);

  Menu.setApplicationMenu(null);
  const isAutoLaunchEnabled = await autoLauncher.isEnabled();
  console.log('Auto-launch enabled:', isAutoLaunchEnabled);

  ipcMain.handle('set-api-url', async (_, url: string) => {
    store.set('apiUrl', url);
    return true;
  });

  ipcMain.handle('get-api-url', async () => store.get('apiUrl'));

  ipcMain.handle('set-auth-data', async (_, data: { token: string, user: any }) => {
    if (data.token) {
      store.set('authToken', data.token);
      store.set('userData', data.user);
      await initializeWebSocket();
    } else {
      store.delete('authToken');
      store.delete('userData');
      if (pusherClient) {
        pusherClient.disconnect();
        pusherClient = null;
      }
    }
    // Update tray menu when auth state changes
    await createTray();
    return true;
  });

  ipcMain.handle('get-auth-data', async () => {
    const token = store.get('authToken');
    const userData = store.get('userData');
    return { token: token || null, userData: userData || null };
  });

  ipcMain.handle('clear-auth-data', async () => {
    store.delete('authToken');
    store.delete('userData');
    if (pusherClient) {
      pusherClient.disconnect();
      pusherClient = null;
    }
    // Update tray menu when auth state changes
    await createTray();
    return true;
  });

  ipcMain.handle('set-device-id', async (_, deviceId: string) => {
    const deviceIdPath = path.join(app.getPath('userData'), 'device-id');
    fs.writeFileSync(deviceIdPath, deviceId, 'utf8');
    return true;
  });

  ipcMain.handle('get-auto-launch', async () => {
    try {
      return await autoLauncher.isEnabled();
    } catch (error) {
      console.error('Failed to get auto-launch status:', error);
      return false;
    }
  });

  ipcMain.handle('set-auto-launch', async (_, enabled: boolean) => {
    try {
      if (enabled) {
        await autoLauncher.enable();
      } else {
        await autoLauncher.disable();
      }
      return true;
    } catch (error) {
      console.error('Failed to set auto-launch:', error);
      return false;
    }
  });

  ipcMain.handle('get-notification-preferences', async () => await getNotificationPreferences());
  ipcMain.handle('toggle-notification-preference', async (_, key: string) => await toggleNotificationPreference(key));

  app.on('before-quit', () => {
    isQuitting = true;
  });

  win = createWindow();
  await createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    win = createWindow();
    createTray();
  }
});
