// AJ Trade Value — processo principal do aplicativo.
// Abre a janela, serve os arquivos do site por um protocolo próprio (aj://) e
// atualiza os valores do wiki uma vez por dia.
import { app, BrowserWindow, Menu, ipcMain, protocol, net, shell, dialog, globalShortcut, screen } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { runUpdate } from './update.mjs';
import { Macros } from './macros.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userDir = app.getPath('userData');
const dataDir = path.join(userDir, 'data');
const configFile = path.join(userDir, 'config.json');
const UPDATE_AFTER_HOURS = 20;
const CHECK_EVERY_MS = 60 * 60 * 1000;

protocol.registerSchemesAsPrivileged([
  { scheme: 'aj', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const readConfig = () => { try { return JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch { return {}; } };
const writeConfig = cfg => { try { fs.mkdirSync(userDir, { recursive: true }); fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2)); } catch {} };

let win = null;
let status = { state: 'idle', step: '', pct: 0, updatedAt: readConfig().lastUpdate || null };
let updating = null;
let macros = null;

// Aba Automação: F8 marca a posição do mouse, F9 para tudo. Só ficam ligados com a aba aberta.
function setHotkeys(on) {
  globalShortcut.unregisterAll();
  if (!on) return;
  globalShortcut.register('F8', () => {
    const ponto = screen.dipToScreenPoint(screen.getCursorScreenPoint()); // pixels de verdade, como o runner usa
    win?.webContents.send('aj:auto-position', { x: Math.round(ponto.x), y: Math.round(ponto.y) });
  });
  globalShortcut.register('F9', () => { if (macros?.running) macros.stop(); });
}

function setStatus(next) {
  status = { ...status, ...next };
  win?.webContents.send('aj:status', status);
}

// items.js atualizado fica na pasta do usuário; o resto vem de dentro do aplicativo.
function resolveFile(urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, '') || 'index.html';
  if (rel.includes('..')) return null;
  const updated = path.join(dataDir, rel);
  if (rel === 'items.js' && fs.existsSync(updated)) return updated;
  const inside = path.join(appRoot, rel);
  return fs.existsSync(inside) ? inside : null;
}

async function update({ manual = false } = {}) {
  if (updating) return updating;
  setStatus({ state: 'running', step: 'Procurando valores novos…', pct: 2 });
  updating = runUpdate({ appRoot, dataDir, onStatus: setStatus })
    .then(result => {
      const cfg = readConfig();
      cfg.lastUpdate = new Date().toISOString();
      writeConfig(cfg);
      setStatus({ state: 'done', step: `${result.items.toLocaleString('pt-BR')} itens atualizados`, pct: 100, updatedAt: cfg.lastUpdate });
      win?.webContents.reloadIgnoringCache(); // recarrega com os valores novos
      return result;
    })
    .catch(err => {
      setStatus({ state: 'error', step: `Não deu para atualizar agora (${err.message})`, pct: 0 });
      if (manual) dialog.showMessageBox(win, { type: 'warning', title: 'Atualização', message: 'Não deu para atualizar os valores agora.', detail: `${err.message}\n\nO aplicativo continua com os valores que já tinha.` });
    })
    .finally(() => { updating = null; });
  return updating;
}

function maybeUpdate() {
  const last = readConfig().lastUpdate;
  const hours = last ? (Date.now() - Date.parse(last)) / 36e5 : Infinity;
  if (hours >= UPDATE_AFTER_HOURS) update();
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Valores',
      submenu: [
        { label: 'Atualizar agora', accelerator: 'F5', click: () => update({ manual: true }) },
        { label: 'Abrir o AJ Item Worth Wiki', click: () => shell.openExternal('https://aj-item-worth.fandom.com') },
        { type: 'separator' },
        { label: 'Sair', role: 'quit' },
      ],
    },
    {
      label: 'Janela',
      submenu: [
        { label: 'Recarregar', accelerator: 'CmdOrCtrl+R', click: () => win?.reload() },
        { label: 'Aumentar', role: 'zoomIn' }, { label: 'Diminuir', role: 'zoomOut' }, { label: 'Tamanho normal', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Tela cheia', role: 'togglefullscreen' },
        { label: 'Ferramentas de desenvolvedor', role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Sobre',
          click: () => dialog.showMessageBox(win, {
            type: 'info', title: 'AJ Trade Value pra Ste <3',
            message: `AJ Trade Value  ${app.getVersion()}`,
            detail: 'Calculadora de trocas do Animal Jam Classic.\nValores da comunidade, do AJ Item Worth Wiki (CC BY-SA).\nOs valores são baixados sozinhos uma vez por dia.\n\nFeito por fãs. Sem ligação com a WildWorks ou o Animal Jam.',
          }),
        },
        { label: 'Código do projeto', click: () => shell.openExternal('https://github.com/yurirubim1/AJ-trade') },
      ],
    },
  ]));
}

function createWindow() {
  const cfg = readConfig();
  win = new BrowserWindow({
    ...(cfg.bounds || { width: 1280, height: 880 }),
    minWidth: 380, minHeight: 560,
    title: 'AJ Trade Value pra Ste <3',
    backgroundColor: '#E9F0E6',
    autoHideMenuBar: false,
    icon: path.join(appRoot, 'build', 'icon.ico'),
    webPreferences: { preload: path.join(appRoot, 'app', 'preload.cjs'), spellcheck: false },
  });
  win.loadURL('aj://app/index.html');
  win.on('close', () => { const c = readConfig(); c.bounds = win.getNormalBounds(); writeConfig(c); });
  win.on('closed', () => { win = null; });
  // links externos abrem no navegador do computador
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('aj://')) { e.preventDefault(); shell.openExternal(url); } });
  // AJ_SHOT=caminho.png abre, fotografa a janela e fecha — usado para conferir o aplicativo sem abrir na mão.
  if (process.env.AJ_SHOT) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      if (process.env.AJ_TAB) {
        await win.webContents.executeJavaScript(`document.querySelector('[data-tab="${process.env.AJ_TAB}"]')?.click()`).catch(() => {});
        await new Promise(r => setTimeout(r, 900));
      }
      for (const seletor of (process.env.AJ_CLICK || '').split(';').filter(Boolean)) {
        await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(seletor)})?.click()`).catch(() => {});
        await new Promise(r => setTimeout(r, Number(process.env.AJ_WAIT) || 900));
      }
      if (process.env.AJ_EVAL) {
        const resultado = await win.webContents.executeJavaScript(process.env.AJ_EVAL).catch(err => `erro: ${err.message}`);
        console.log('AJ_EVAL:', JSON.stringify(resultado));
      }
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        win.show(); win.focus();
        const png = (await win.webContents.capturePage()).toPNG();
        if (png.length) { fs.writeFileSync(process.env.AJ_SHOT, png); break; }
        await new Promise(r => setTimeout(r, 700));
      }
      app.exit(0);
    }, 2500));
  }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    protocol.handle('aj', request => {
      const file = resolveFile(new URL(request.url).pathname);
      return file ? net.fetch(pathToFileURL(file).toString()) : new Response('Arquivo não encontrado', { status: 404 });
    });
    buildMenu();
    createWindow();
    setTimeout(maybeUpdate, 4000);
    setInterval(maybeUpdate, CHECK_EVERY_MS);
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => { globalShortcut.unregisterAll(); macros?.stop(); });
  ipcMain.handle('aj:update-now', () => update({ manual: true }));
  ipcMain.handle('aj:status', () => status);

  macros = new Macros({ appRoot, userDir, onEvent: evento => win?.webContents.send('aj:auto-event', evento) });
  ipcMain.handle('aj:auto-list', () => macros.list());
  ipcMain.handle('aj:auto-save', (_e, macro) => macros.save(macro));
  ipcMain.handle('aj:auto-delete', (_e, id) => macros.remove(id));
  ipcMain.handle('aj:auto-run', (_e, plan) => macros.run(plan));
  ipcMain.handle('aj:auto-stop', () => macros.stop());
  ipcMain.handle('aj:auto-hotkeys', (_e, on) => setHotkeys(!!on));
  ipcMain.handle('aj:auto-cursor', () => {
    const ponto = screen.dipToScreenPoint(screen.getCursorScreenPoint());
    return { x: Math.round(ponto.x), y: Math.round(ponto.y) };
  });
}
