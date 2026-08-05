const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const getPort = require('get-port');

let mainWindow;
let nextServer;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    // In development, Next.js is started by "npm run dev:electron" which runs "next dev"
    mainWindow.loadURL('http://localhost:2000');
    // mainWindow.webContents.openDevTools();
  } else {
    // In production, we need to start the Next.js standalone server
    const port = await getPort({ port: 2000 });
    const serverPath = path.join(__dirname, '..', '.next', 'standalone', 'server.js');
    
    const fs = require('fs');
    const tempDir = app.getPath('temp');
    const fakeNodeDir = path.join(tempDir, 'fake-node-bin');
    if (!fs.existsSync(fakeNodeDir)) fs.mkdirSync(fakeNodeDir, { recursive: true });
    
    const fakeNodePath = path.join(fakeNodeDir, 'node');
    if (!fs.existsSync(fakeNodePath)) {
      fs.writeFileSync(fakeNodePath, `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${process.execPath}" "$@"\n`);
      fs.chmodSync(fakeNodePath, 0o755);
    }

    const customEnv = {
      ...process.env,
      PATH: `${fakeNodeDir}:${process.env.PATH || ''}`,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: port.toString(),
      NODE_ENV: 'production'
    };

    // Load .env explicitly since process.cwd() is unreliable in packaged Electron apps
    try {
      const dotenv = require('dotenv');
      const envPath = path.join(__dirname, '..', '.env');
      if (fs.existsSync(envPath)) {
        const parsed = dotenv.parse(fs.readFileSync(envPath));
        Object.assign(customEnv, parsed);
      }
    } catch (e) {
      console.error("Failed to load .env:", e);
    }

    // 1. Start the Next.js standalone server
    nextServer = spawn(process.execPath, [serverPath], { env: customEnv });

    // 2. Start the BullMQ Worker
    const workerPath = path.join(__dirname, '..', 'src', 'lib', 'bullmq', 'worker', 'menu-parser.js');
    const workerProcess = spawn(process.execPath, [workerPath], { env: customEnv });

    // 3. Start the Bull Dashboard
    const dashboardPath = path.join(__dirname, '..', 'bull-server', 'dashboard.js');
    const dashboardProcess = spawn(process.execPath, [dashboardPath], { env: customEnv });

    // Ensure all processes are cleaned up when the app closes
    app.on('before-quit', () => {
      if (workerProcess) workerProcess.kill();
      if (dashboardProcess) dashboardProcess.kill();
    });

    // Wait a brief moment for the server to spin up, then load
    setTimeout(() => {
      mainWindow.loadURL(`http://localhost:${port}`);
    }, 1000);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up the Next.js server when Electron quits
app.on('before-quit', () => {
  if (nextServer) {
    nextServer.kill();
  }
});
