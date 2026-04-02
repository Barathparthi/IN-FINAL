const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  onWindowBlur: (callback) => ipcRenderer.on('electron-blur', (event, base64) => callback(base64)),
  onKeyboardViolation: (callback) => ipcRenderer.on('keyboard-violation', (event, key) => callback(key)),
  
  // New proctoring APIs
  checkMonitors: () => ipcRenderer.invoke('check-monitors'),
  clearClipboard: () => ipcRenderer.send('clear-clipboard'),
  checkProcesses: () => ipcRenderer.invoke('check-processes'),
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
  checkVM: () => ipcRenderer.invoke('check-vm'),
  quitApp: () => ipcRenderer.send('quit-app'),
});

// For compatibility with the updated React frontend code
contextBridge.exposeInMainWorld('electronBridge', {
  isElectron: true,
  notifyTestComplete: () => ipcRenderer.send('quit-app'),
  onFocusLost: (callback) => ipcRenderer.on('electron-blur', () => callback()),
  offFocusLost: () => ipcRenderer.removeAllListeners('electron-blur')
});
