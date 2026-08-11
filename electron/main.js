import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/server.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

let server;
let mainWindow;

function startServer() {
  return new Promise((resolve, reject) => {
    // Port 0 lets the OS pick a free port, so the app never collides
    // with another process using the default 4173.
    server = createApp().listen(0, '127.0.0.1', () => resolve(server.address().port));
    server.on('error', reject);
  });
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 720,
    minHeight: 560,
    title: 'Loopdrop',
    backgroundColor: '#0f1115',
    icon: path.join(dirname, 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Keep external links (e.g. "open on YouTube") in the user's browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  const port = await startServer();
  createWindow(port);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('quit', () => {
  server?.close();
});
