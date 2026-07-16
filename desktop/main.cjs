/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, dialog, shell, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('node:path');

app.setName('GASI MediQuote');
const APP_URL = process.env.GASI_APP_URL || 'https://gasi-mediquote.netlify.app';
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

let mainWindow;
let isQuitting = false;

function iconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'branding', 'gasi-logo.png')
    : path.join(process.cwd(), 'public', 'branding', 'gasi-logo.png');
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    title: `GASI MediQuote ${app.getVersion()}`,
    icon: iconPath(),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_URL)) return { action: 'allow' };
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_URL)) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });
  try {
    await mainWindow.loadURL(APP_URL);
    mainWindow.show();
  } catch {
    const { response } = await dialog.showMessageBox({
      type: 'error',
      title: 'Sin conexión con GASI MediQuote',
      message: 'No se puede conectar con la aplicación compartida.',
      detail: 'Compruebe la conexión a Internet. Ningún presupuesto ha sido modificado.',
      buttons: ['Reintentar', 'Cerrar'],
      defaultId: 0,
    });
    if (response === 0) return createWindow();
    app.quit();
  }
}

function configureUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Actualización preparada',
      message: `GASI MediQuote ${info.version} está lista.`,
      detail: 'Los presupuestos están en la base compartida y no se perderán.',
      buttons: ['Instalar y reiniciar', 'Instalar al cerrar'],
      defaultId: 0,
    });
    if (response === 0) autoUpdater.quitAndInstall(false, true);
  });
  autoUpdater.on('error', (error) => console.error('[desktop-updater]', error));
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => undefined), 4000);
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  await createWindow();
  configureUpdates();
});
app.on('window-all-closed', () => app.quit());

// La sesión es deliberadamente de la aplicación, no persistente: al cerrar
// GASI MediQuote se elimina el token aunque el motor de Electron conserve datos.
app.on('before-quit', (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  const origin = new URL(APP_URL).origin;
  session.defaultSession.cookies.remove(origin, 'gasi_session')
    .catch(() => undefined)
    .finally(() => app.quit());
});
