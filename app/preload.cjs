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
  runId: id => ipcRenderer.invoke('aj:auto-run-id', id),
  record: ligar => ipcRenderer.invoke('aj:auto-record', ligar),
  opcoes: () => ipcRenderer.invoke('aj:auto-opcoes'),
  definirTeclaGravar: tecla => ipcRenderer.invoke('aj:auto-tecla-gravar', tecla),
  isRecording: () => ipcRenderer.invoke('aj:auto-recording'),
  mini: abrir => ipcRenderer.invoke('aj:mini', abrir),
  recortar: modo => ipcRenderer.invoke('aj:auto-recortar', modo),
  imagem: id => ipcRenderer.invoke('aj:auto-imagem', id),
  sempreEmCima: ligar => ipcRenderer.invoke('aj:sempre-em-cima', ligar),
  onEvent: callback => ipcRenderer.on('aj:auto-event', (_event, evento) => callback(evento)),
  onPosition: callback => ipcRenderer.on('aj:auto-position', (_event, ponto) => callback(ponto)),
});

// Janela de recorte: recebe a foto da tela e devolve o retângulo escolhido.
contextBridge.exposeInMainWorld('ajRecorte', {
  onFoto: callback => ipcRenderer.on('aj:recorte-foto', (_event, dados) => callback(dados)),
  concluir: retangulo => ipcRenderer.send('aj:recorte-fim', retangulo),
  cancelar: () => ipcRenderer.send('aj:recorte-fim', null),
});
