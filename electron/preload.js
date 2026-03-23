const { contextBridge } = require('electron')

// Expose a minimal API to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
})
