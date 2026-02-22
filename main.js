const path = require("path");
const { app, BrowserWindow, clipboard, screen, ipcMain } = require("electron");
const { GoogleGenAI } = require("@google/genai");
require("dotenv").config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

let mainWindow = null;
let popupWindow = null;
let lastSelection = "";
let debounceTimer = null;

async function generateExplanation(prompt) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });
  return response.text;
}

function parseJsonObject(rawText) {
  if (!rawText) return null;
  const fenced = rawText.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : rawText.trim();
  try {
    return JSON.parse(candidate);
  } catch {}

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function generateSessionAnalysis(bookTitle, passage) {
  const prompt = `You are Understory, a cozy AI reading companion.
Return ONLY valid JSON in this shape:
{
  "explanation": "2-3 clear sentences explaining the passage",
  "themes": ["theme 1", "theme 2", "theme 3", "theme 4"],
  "devices": [
    {
      "name": "device name",
      "explanation": "one short sentence about how it appears in this passage",
      "evidence": "short quoted phrase from the passage"
    }
  ]
}
Rules:
- themes should reflect the book as a whole, not just one sentence from the passage
- each theme should be 1-4 words
- return 4 to 7 themes
- devices should be literary devices present in this passage
- return 3 to 5 devices
- each device needs a specific explanation grounded in this passage
- keep evidence very short (about 3-8 words)

Book: ${bookTitle || "Unknown"}
Passage:
"${passage}"`;

  const raw = await generateExplanation(prompt);
  const parsed = parseJsonObject(raw);
  if (!parsed || typeof parsed !== "object") {
    return { explanation: raw, themes: [], devices: [] };
  }

  const explanation =
    typeof parsed.explanation === "string" && parsed.explanation.trim()
      ? parsed.explanation.trim()
      : raw;
  const themes = Array.isArray(parsed.themes)
    ? parsed.themes
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.trim())
        .slice(0, 8)
    : [];
  const devices = Array.isArray(parsed.devices)
    ? parsed.devices
        .map((item) => {
          if (typeof item === "string") {
            const name = item.trim();
            if (!name) return null;
            return { name, explanation: "", evidence: "" };
          }
          if (!item || typeof item !== "object") return null;
          const name = typeof item.name === "string" ? item.name.trim() : "";
          const explanation =
            typeof item.explanation === "string"
              ? item.explanation.trim()
              : "";
          const evidence =
            typeof item.evidence === "string" ? item.evidence.trim() : "";
          if (!name) return null;
          return { name, explanation, evidence };
        })
        .filter(Boolean)
        .slice(0, 6)
    : [];

  return { explanation, themes, devices };
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 600,
    title: "Understory",
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
      const explanation = await generateExplanation(prompt);
      if (!popupWindow.isDestroyed())
        popupWindow.webContents.send("explanation", explanation);
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send("explanation", explanation);
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

ipcMain.handle("analyze-passage", async (_event, payload) => {
  const bookTitle = payload?.bookTitle?.trim() || "";
  const passage = payload?.passage?.trim() || "";

  if (!passage) {
    return { ok: false, error: "Please provide a passage to analyze." };
  }

  try {
    const analysis = await generateSessionAnalysis(bookTitle, passage);
    return {
      ok: true,
      text: analysis.explanation,
      themes: analysis.themes,
      devices: analysis.devices,
    };
  } catch (err) {
    return { ok: false, error: "Error: " + err.message };
  }
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
