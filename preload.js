const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  showNotification: (title, body) => {
    ipcRenderer.send('show-notification', { title, body })
  }
}) 