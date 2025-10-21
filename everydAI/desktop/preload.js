const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // Authentication
  login: (credentials) => {
    return ipcRenderer.send('login', credentials);
  },
  
  onLoginResult: (callback) => {
    ipcRenderer.on('login-result', (event, result) => callback(result));
  },
  
  // Settings
  getSettings: () => {
    ipcRenderer.send('get-settings');
  },
  
  onSettings: (callback) => {
    ipcRenderer.on('settings', (event, settings) => callback(settings));
  },
  
  updateSettings: (settings) => {
    ipcRenderer.send('update-settings', settings);
  },
  
  onSettingsUpdated: (callback) => {
    ipcRenderer.on('settings-updated', () => callback());
  },
  
  // Connection status
  onConnectionStatus: (callback) => {
    ipcRenderer.on('connection-status', (event, status) => callback(status));
  },
  
  // Notifications and events
  onNotification: (callback) => {
    ipcRenderer.on('notification', (event, data) => callback(data));
  },
  
  onSMS: (callback) => {
    ipcRenderer.on('sms', (event, data) => callback(data));
  },
  
  onCall: (callback) => {
    ipcRenderer.on('call', (event, data) => callback(data));
  },
  
  // Navigation events
  onShowSettings: (callback) => {
    ipcRenderer.on('show-settings', () => callback());
  },
  
  onShowNotification: (callback) => {
    ipcRenderer.on('show-notification', (event, id) => callback(id));
  },
  
  onShowSMS: (callback) => {
    ipcRenderer.on('show-sms', (event, id) => callback(id));
  },
  
  onShowCall: (callback) => {
    ipcRenderer.on('show-call', (event, id) => callback(id));
  },
  
  // Send messages
  sendMessage: (data) => {
    ipcRenderer.send('send-message', data);
  },
  
  onSendResult: (callback) => {
    ipcRenderer.on('send-result', (event, result) => callback(result));
  }
});
