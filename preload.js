const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    listLocalFiles: (path) => ipcRenderer.invoke('list-local-files', path),
    listDevices: () => ipcRenderer.invoke('list-devices'),
    listAndroidFiles: (path, deviceSerial) => ipcRenderer.invoke('list-android-files', path, deviceSerial),
    copyToAndroid: (localPath, androidPath, deviceSerial) => ipcRenderer.invoke('copy-to-android', localPath, androidPath, deviceSerial),
    copyToMac: (androidPath, localPath, deviceSerial) => ipcRenderer.invoke('copy-to-mac', androidPath, localPath, deviceSerial),
    deleteLocal: (path) => ipcRenderer.invoke('delete-local', path),
    deleteAndroid: (path, deviceSerial) => ipcRenderer.invoke('delete-android', path, deviceSerial),
    readLocalFile: (path) => ipcRenderer.invoke('read-local-file', path),
    saveLocalFile: (path, content) => ipcRenderer.invoke('save-local-file', path, content),
    readAndroidFile: (path, deviceSerial) => ipcRenderer.invoke('read-android-file', path, deviceSerial),
    saveAndroidFile: (path, content, deviceSerial) => ipcRenderer.invoke('save-android-file', path, content, deviceSerial),
    onDeviceListChanged: (callback) => ipcRenderer.on('device-list-changed', callback)
});
