const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#2b2f36',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('project:save', async (event, jsonString) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Enregistrer le projet',
    defaultPath: 'projet.mdl3d.json',
    filters: [{ name: 'Projet 3D', extensions: ['json'] }]
  });
  if (canceled || !filePath) return { ok: false };
  await fs.writeFile(filePath, jsonString, 'utf-8');
  return { ok: true, filePath };
});

ipcMain.handle('project:open', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Ouvrir un projet',
    filters: [{ name: 'Projet 3D', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (canceled || filePaths.length === 0) return { ok: false };
  const content = await fs.readFile(filePaths[0], 'utf-8');
  return { ok: true, content, filePath: filePaths[0] };
});

ipcMain.handle('project:exportObj', async (event, objString) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Exporter en OBJ',
    defaultPath: 'modele.obj',
    filters: [{ name: 'Wavefront OBJ', extensions: ['obj'] }]
  });
  if (canceled || !filePath) return { ok: false };
  await fs.writeFile(filePath, objString, 'utf-8');
  return { ok: true, filePath };
});
