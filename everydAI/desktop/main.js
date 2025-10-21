const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, shell } = require('electron');
const path = require('path');
const axios = require('axios');
const Store = require('electron-store');
const io = require('socket.io-client');

// Create a store for settings
const store = new Store({
  schema: {
    serverUrl: {
      type: 'string',
      default: 'http://localhost:3000'
    },
    wsUrl: {
      type: 'string',
      default: 'ws://localhost:3000/ws'
    },
    token: {
      type: 'string',
      default: ''
    },
    notifications: {
      type: 'boolean',
      default: true
    },
    startMinimized: {
      type: 'boolean',
      default: true
    }
  }
});

// Global references
let mainWindow;
let tray;
let socket;

// Create the main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: !store.get('startMinimized')
  });

  mainWindow.loadFile('index.html');

  // Handle window close to minimize to tray instead
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  // Connect to server when window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    connectToServer();
  });
}

// Create tray icon
function createTray() {
  tray = new Tray(path.join(__dirname, 'assets', 'tray-icon.png'));
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show everydAI', click: () => { mainWindow.show(); } },
    { label: 'Settings', click: () => { mainWindow.show(); mainWindow.webContents.send('show-settings'); } },
    { type: 'separator' },
    { label: 'Reconnect', click: connectToServer },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]);
  
  tray.setToolTip('everydAI Desktop');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

// Connect to WebSocket server
function connectToServer() {
  if (socket) {
    socket.disconnect();
  }
  
  const wsUrl = store.get('wsUrl');
  const token = store.get('token');
  
  if (!token) {
    mainWindow.webContents.send('connection-status', { 
      status: 'error',
      message: 'No authentication token'
    });
    return;
  }
  
  // Connect to WebSocket with authentication
  socket = io(wsUrl, {
    auth: {
      token: token
    },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000
  });
  
  socket.on('connect', () => {
    mainWindow.webContents.send('connection-status', {
      status: 'connected'
    });
    
    // Show notification
    if (store.get('notifications')) {
      new Notification({
        title: 'everydAI Connected',
        body: 'Successfully connected to server'
      }).show();
    }
  });
  
  socket.on('disconnect', () => {
    mainWindow.webContents.send('connection-status', {
      status: 'disconnected'
    });
  });
  
  socket.on('error', (error) => {
    mainWindow.webContents.send('connection-status', {
      status: 'error',
      message: error.message
    });
  });
  
  // Handle incoming events
  socket.on('notification', (data) => {
    mainWindow.webContents.send('notification', data);
    
    // Show desktop notification if enabled
    if (store.get('notifications')) {
      const notif = new Notification({
        title: data.title || 'New Notification',
        body: data.text || 'You have a new notification',
        icon: path.join(__dirname, 'assets', 'icon.png')
      });
      
      notif.show();
      notif.on('click', () => {
        mainWindow.show();
        mainWindow.webContents.send('show-notification', data.id);
      });
    }
  });
  
  socket.on('sms', (data) => {
    mainWindow.webContents.send('sms', data);
    
    // Show desktop notification if enabled
    if (store.get('notifications')) {
      const notif = new Notification({
        title: `SMS from ${data.phoneNumber}`,
        body: data.messageBody || 'New SMS message',
        icon: path.join(__dirname, 'assets', 'icon.png')
      });
      
      notif.show();
      notif.on('click', () => {
        mainWindow.show();
        mainWindow.webContents.send('show-sms', data.id);
      });
    }
  });
  
  socket.on('call', (data) => {
    mainWindow.webContents.send('call', data);
    
    // Show desktop notification if enabled
    if (store.get('notifications')) {
      const notif = new Notification({
        title: `Call ${data.callType} ${data.phoneNumber}`,
        body: data.callType === 'CALL_ENDED' ? `Duration: ${formatDuration(data.duration)}` : 'Incoming call',
        icon: path.join(__dirname, 'assets', 'icon.png')
      });
      
      notif.show();
      notif.on('click', () => {
        mainWindow.show();
        mainWindow.webContents.send('show-call', data.callId);
      });
    }
  });
}

// Handle IPC messages from renderer
ipcMain.on('login', async (event, credentials) => {
  try {
    const response = await axios.post(`${store.get('serverUrl')}/api/auth/login`, credentials);
    store.set('token', response.data.token);
    event.reply('login-result', { success: true });
    connectToServer();
  } catch (error) {
    event.reply('login-result', { 
      success: false, 
      message: error.response?.data?.error || 'Login failed'
    });
  }
});

ipcMain.on('update-settings', (event, settings) => {
  // Update stored settings
  for (const [key, value] of Object.entries(settings)) {
    store.set(key, value);
  }
  
  // Reconnect if server URL or WebSocket URL changed
  if (settings.serverUrl || settings.wsUrl) {
    connectToServer();
  }
  
  event.reply('settings-updated');
});

ipcMain.on('get-settings', (event) => {
  event.reply('settings', store.store);
});

ipcMain.on('send-message', async (event, data) => {
  try {
    const token = store.get('token');
    
    if (!token) {
      event.reply('send-result', { success: false, message: 'Not authenticated' });
      return;
    }
    
    const response = await axios.post(
      `${store.get('serverUrl')}${data.endpoint}`,
      data.payload,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    event.reply('send-result', { success: true, data: response.data });
  } catch (error) {
    event.reply('send-result', { 
      success: false, 
      message: error.response?.data?.error || 'Failed to send message'
    });
  }
});

// Helper function to format duration
function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  if (mins === 0) {
    return `${secs} seconds`;
  } else if (mins === 1) {
    return `1 minute ${secs} seconds`;
  } else {
    return `${mins} minutes ${secs} seconds`;
  }
}

// App lifecycle events
app.whenReady().then(() => {
  createWindow();
  createTray();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
