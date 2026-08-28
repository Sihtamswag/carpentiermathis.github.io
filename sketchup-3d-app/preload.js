const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('projectAPI', {
  save: (jsonString) => ipcRenderer.invoke('project:save', jsonString),
  open: () => ipcRenderer.invoke('project:open'),
  exportObj: (objString) => ipcRenderer.invoke('project:exportObj', objString)
});
