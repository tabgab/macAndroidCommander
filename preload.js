const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    listLocalFiles: (path) => ipcRenderer.invoke('list-local-files', path),
    listDevices: () => ipcRenderer.invoke('list-devices'),
    listAndroidFiles: (path, deviceSerial) => ipcRenderer.invoke('list-android-files', path, deviceSerial),
    copyToAndroid: (localPath, androidPath, deviceSerial) => ipcRenderer.invoke('copy-to-android', localPath, androidPath, deviceSerial),
    copyToMac: (androidPath, localPath, deviceSerial) => ipcRenderer.invoke('copy-to-mac', androidPath, localPath, deviceSerial),
    copyLocalLocal: (source, dest) => ipcRenderer.invoke('copy-local-local', source, dest),
    copyAndroidAndroid: (source, dest, serial) => ipcRenderer.invoke('copy-android-android', source, dest, serial),
    deleteLocal: (path) => ipcRenderer.invoke('delete-local', path),
    deleteAndroid: (path, deviceSerial) => ipcRenderer.invoke('delete-android', path, deviceSerial),
    readLocalFile: (path) => ipcRenderer.invoke('read-local-file', path),
    saveLocalFile: (path, content) => ipcRenderer.invoke('save-local-file', path, content),
    readAndroidFile: (path, deviceSerial) => ipcRenderer.invoke('read-android-file', path, deviceSerial),
    saveAndroidFile: (path, content, deviceSerial) => ipcRenderer.invoke('save-android-file', path, content, deviceSerial),
    onDeviceListChanged: (callback) => ipcRenderer.on('device-list-changed', callback),
    openExternal: (path) => ipcRenderer.invoke('open-external', path),
    pullTempAndroid: (path, deviceSerial) => ipcRenderer.invoke('pull-temp-android', path, deviceSerial),
    renameLocal: (oldPath, newPath) => ipcRenderer.invoke('rename-local', oldPath, newPath),
    renameAndroid: (oldPath, newPath, deviceSerial) => ipcRenderer.invoke('rename-android', oldPath, newPath, deviceSerial),
    getLocalDirSize: (path) => ipcRenderer.invoke('get-local-dir-size', path),
    getAndroidDirSize: (path, deviceSerial) => ipcRenderer.invoke('get-android-dir-size', path, deviceSerial)
});
