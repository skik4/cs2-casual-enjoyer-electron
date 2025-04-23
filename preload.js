const { contextBridge, ipcRenderer } = require('electron');

const electronAPI = {
    minimize: () => ipcRenderer.send('window-minimize'),
    close: () => ipcRenderer.send('window-close'),
    loadSettings: () => ipcRenderer.invoke('settings-load'),
    saveSettings: (data) => ipcRenderer.invoke('settings-save', data),
    log: (level, message) => {
        ipcRenderer.send('log-message', level, message);
    },
    openExternal: (url) => ipcRenderer.send('open-external', url),
    getAppVersion: () => ipcRenderer.invoke('get-app-version')
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
