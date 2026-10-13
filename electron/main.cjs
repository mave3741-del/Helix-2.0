/* eslint-disable @typescript-eslint/no-require-imports -- Electron main process: .cjs by design, requires CommonJS require() */
// Electron main process for the HELIX desktop app.
//
// HELIX is a full TanStack Start server (not a static site), so this spawns
// the built server (`.output/server/index.mjs`, produced by
// `npm run build:desktop`) as a local child process on a free port, waits
// for it to report ready, then opens a native window pointing at it —
// closing the window stops the server too.
const { app, BrowserWindow, Menu } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const net = require("node:net");
const fs = require("node:fs");

const SERVER_ENTRY = path.join(__dirname, "..", ".output", "server", "index.mjs");
const APP_DATA_DIR = app.getPath("userData");

let serverProcess = null;
let mainWindow = null;

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function startServer(port) {
  if (!fs.existsSync(SERVER_ENTRY)) {
    throw new Error(
      `Built server not found at ${SERVER_ENTRY}. Run "npm run build:desktop" first, then "npm run electron:start".`,
    );
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER_ENTRY], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        PORT: String(port),
        HOST: "127.0.0.1",
        // Keep this install's data (provider keys, PGLite db file, etc.)
        // under the OS-standard app-data folder instead of the app bundle.
        HELIX_DATA_DIR: APP_DATA_DIR,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let settled = false;
    const onOutput = (buf) => {
      const text = buf.toString();
      if (!settled && /listening/i.test(text)) {
        settled = true;
        resolve(child);
      }
    };
    child.stdout.on("data", onOutput);
    child.stderr.on("data", onOutput);
    child.on("error", (err) => {
      if (!settled) reject(err);
    });
    child.on("exit", (code) => {
      if (!settled) reject(new Error(`Server exited early (code ${code})`));
    });

    // Fallback: some server builds print nothing recognizable — proceed
    // after a short grace period rather than hanging forever.
    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(child);
      }
    }, 4000);
  });
}

async function createWindow() {
  const port = await findFreePort();
  serverProcess = await startServer(port);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#04060d",
    title: "HELIX",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  Menu.setApplicationMenu(null);
  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);

  if (process.env.HELIX_E2E_SCREENSHOT) {
    await new Promise((r) => setTimeout(r, 2500));
    const image = await mainWindow.webContents.capturePage();
    fs.writeFileSync(process.env.HELIX_E2E_SCREENSHOT, image.toPNG());
    app.quit();
    return;
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow().catch((err) => {
    console.error("[helix-desktop] failed to start:", err);
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});
