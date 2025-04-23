const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

function readSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    }
  } catch (e) {}
  return null;
}

function writeSettings(data) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    return false;
  }
}

function createWindow () {
  const win = new BrowserWindow({
    width: 850,
    height: 900,
    minWidth: 850, // Prevent window from being smaller than 850px
    minHeight: 800, // Prevent window from being smaller than 800px
    frame: false,
    resizable: true, // Allow resizing
    maximizable: true, // Allow maximizing
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile('index.html');
  win.setMenuBarVisibility(false);

  win.webContents.setWindowOpenHandler(({ url }) => {
    const { shell } = require('electron');
    shell.openExternal(url);
    return { action: 'deny' };
  });

  ipcMain.on('window-minimize', () => {
    win.minimize();
  });
  ipcMain.on('window-close', () => {
    win.close();
  });

  // Показывать окно только после полной загрузки страницы
  win.webContents.on('did-finish-load', () => {
    win.show();
  });
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle('settings-load', () => {
    return readSettings();
  });

  ipcMain.handle('settings-save', (event, data) => {
    return writeSettings(data);
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
