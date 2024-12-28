const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  showNotification: (title, body) => {
    ipcRenderer.send('show-notification', { title, body })
  },
  getCurrentVersion: () => ipcRenderer.invoke('get-current-version'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  startUpdate: () => ipcRenderer.invoke('start-update')
}) 
