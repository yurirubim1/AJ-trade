// Ponte entre a página e o aplicativo: atualização dos valores e aba de automação.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ajApp', {
  version: process.env.npm_package_version || '',
  updateNow: () => ipcRenderer.invoke('aj:update-now'),
  getStatus: () => ipcRenderer.invoke('aj:status'),
  onStatus: callback => ipcRenderer.on('aj:status', (_event, status) => callback(status)),
});

contextBridge.exposeInMainWorld('ajAuto', {
  list: () => ipcRenderer.invoke('aj:auto-list'),
  save: macro => ipcRenderer.invoke('aj:auto-save', macro),
  remove: id => ipcRenderer.invoke('aj:auto-delete', id),
  run: plan => ipcRenderer.invoke('aj:auto-run', plan),
  stop: () => ipcRenderer.invoke('aj:auto-stop'),
  hotkeys: on => ipcRenderer.invoke('aj:auto-hotkeys', on),
  cursor: () => ipcRenderer.invoke('aj:auto-cursor'),
  onEvent: callback => ipcRenderer.on('aj:auto-event', (_event, evento) => callback(evento)),
  onPosition: callback => ipcRenderer.on('aj:auto-position', (_event, ponto) => callback(ponto)),
});
