const path = require("path");
const { app, BrowserWindow, clipboard, screen, ipcMain } = require("electron");
const { GoogleGenAI } = require("@google/genai");
require("dotenv").config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

let mainWindow = null;
let popupWindow = null;
let lastSelection = "";
let debounceTimer = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 600,
    title: "LitHelper",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });
  mainWindow.loadFile("index.html");

  // Ctrl++ (Shift+= on most keyboards) isn't caught by Electron's default zoom handler
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.control && (input.key === "=" || input.key === "+")) {
      mainWindow.webContents.setZoomFactor(
        Math.min(3.0, mainWindow.webContents.getZoomFactor() + 0.1),
      );
      event.preventDefault();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Poll X11 PRIMARY selection every 300ms.
// On Linux with X11/XWayland (Electron's default), highlighting text
// automatically populates the primary selection — no Ctrl+C needed.
setInterval(() => {
  let sel = "";
  try {
    sel = clipboard.readText("selection").trim();
  } catch {}
  if (sel && sel !== lastSelection && sel.length >= 5) {
    lastSelection = sel;
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send("selection", sel);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => triggerExplain(sel), 600);
  }
}, 300);

async function triggerExplain(text) {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x: dx, y: dy, width: dw, height: dh } = display.bounds;

  const W = 340,
    H = 220;
  let px = cursor.x + 15;
  let py = cursor.y + 15;
  // Keep popup within screen bounds
  if (px + W > dx + dw) px = cursor.x - W - 10;
  if (py + H > dy + dh) py = cursor.y - H - 10;

  if (popupWindow && !popupWindow.isDestroyed()) popupWindow.close();

  popupWindow = new BrowserWindow({
    width: W,
    height: H,
    x: px,
    y: py,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "popup-preload.js"),
      contextIsolation: true,
    },
  });

  popupWindow.loadFile("popup.html");

  popupWindow.webContents.once("did-finish-load", async () => {
    const snippet = text.length > 120 ? text.slice(0, 120) + "\u2026" : text;
    popupWindow.webContents.send("loading", snippet);
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send("loading");

    try {
      const prompt = `Explain this passage in 2-3 plain, clear sentences:\n\n"${text}"`;
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });
      if (!popupWindow.isDestroyed())
        popupWindow.webContents.send("explanation", response.text);
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send("explanation", response.text);
    } catch (err) {
      if (!popupWindow.isDestroyed())
        popupWindow.webContents.send("error", "Error: " + err.message);
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send("error", "Error: " + err.message);
    }
  });

  // Auto-close after 15 seconds
  setTimeout(() => {
    if (popupWindow && !popupWindow.isDestroyed()) popupWindow.close();
  }, 15000);
}

ipcMain.on("close-popup", () => {
  if (popupWindow && !popupWindow.isDestroyed()) popupWindow.close();
});

app.whenReady().then(() => {
  // Seed lastSelection so the poller doesn't fire on pre-existing clipboard content
  try {
    lastSelection = clipboard.readText("selection").trim();
  } catch {}
  createMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
