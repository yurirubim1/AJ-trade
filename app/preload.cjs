// Ponte entre a página e o aplicativo: só o necessário para a barra de atualização.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ajApp', {
  version: process.env.npm_package_version || '',
  updateNow: () => ipcRenderer.invoke('aj:update-now'),
  getStatus: () => ipcRenderer.invoke('aj:status'),
  onStatus: callback => ipcRenderer.on('aj:status', (_event, status) => callback(status)),
});
