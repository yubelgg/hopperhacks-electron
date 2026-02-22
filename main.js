const path = require("path");
const { app, BrowserWindow, clipboard, screen, ipcMain } = require("electron");
const { GoogleGenAI } = require("@google/genai");
const { ElevenLabsClient } = require("@elevenlabs/elevenlabs-js");
require("dotenv").config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

let mainWindow = null;
let popupWindow = null;
let lastSelection = "";
let debounceTimer = null;
let replacingPopup = false;

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
  "themes": [
    { "name": "theme name", "description": "one sentence about how this theme appears" }
  ],
  "devices": [
    {
      "name": "device name",
      "explanation": "one short sentence about how it appears in this passage",
      "evidence": "short quoted phrase from the passage"
    }
  ],
  "characters": [
    {
      "name": "character name",
      "role": "one sentence about their role in this passage",
      "relationship": "one sentence about how they relate to other characters"
    }
  ]
}
Rules:
- themes should reflect the book as a whole, not just one sentence from the passage
- each theme name should be 1-4 words
- each theme description should be 1 concise sentence
- return 4 to 7 themes
- devices should be literary devices present in this passage
- return 3 to 5 devices
- each device needs a specific explanation grounded in this passage
- keep evidence very short (about 3-8 words)
- characters should be characters mentioned or implied in this passage
- return 2 to 5 characters
- each character needs a role and relationship grounded in this passage

Book: ${bookTitle || "Unknown"}
Passage:
"${passage}"`;

  const raw = await generateExplanation(prompt);
  const parsed = parseJsonObject(raw);
  if (!parsed || typeof parsed !== "object") {
    return { explanation: raw, themes: [], devices: [], characters: [] };
  }

  const explanation =
    typeof parsed.explanation === "string" && parsed.explanation.trim()
      ? parsed.explanation.trim()
      : raw;
  const themes = Array.isArray(parsed.themes)
    ? parsed.themes
        .map((item) => {
          if (typeof item === "string") {
            const name = item.trim();
            if (!name) return null;
            return { name, description: "" };
          }
          if (!item || typeof item !== "object") return null;
          const name = typeof item.name === "string" ? item.name.trim() : "";
          const description =
            typeof item.description === "string" ? item.description.trim() : "";
          if (!name) return null;
          return { name, description };
        })
        .filter(Boolean)
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
            typeof item.explanation === "string" ? item.explanation.trim() : "";
          const evidence =
            typeof item.evidence === "string" ? item.evidence.trim() : "";
          if (!name) return null;
          return { name, explanation, evidence };
        })
        .filter(Boolean)
        .slice(0, 6)
    : [];

  const characters = Array.isArray(parsed.characters)
    ? parsed.characters
        .map((item) => {
          if (typeof item === "string") {
            const name = item.trim();
            if (!name) return null;
            return { name, role: "", relationship: "" };
          }
          if (!item || typeof item !== "object") return null;
          const name = typeof item.name === "string" ? item.name.trim() : "";
          const role = typeof item.role === "string" ? item.role.trim() : "";
          const relationship =
            typeof item.relationship === "string"
              ? item.relationship.trim()
              : "";
          if (!name) return null;
          return { name, role, relationship };
        })
        .filter(Boolean)
        .slice(0, 5)
    : [];

  return { explanation, themes, devices, characters };
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

  if (popupWindow && !popupWindow.isDestroyed()) {
    replacingPopup = true;
    popupWindow.close();
  }

  popupWindow = new BrowserWindow({
    width: W,
    height: H,
    x: px,
    y: py,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    ...(process.platform === "darwin" ? { type: "panel" } : {}),
    webPreferences: {
      preload: path.join(__dirname, "popup-preload.js"),
      contextIsolation: true,
    },
  });

  popupWindow.loadFile("popup.html");

  popupWindow.on("closed", () => {
    if (replacingPopup) {
      replacingPopup = false;
    } else {
      clearTimeout(debounceTimer);
    }
  });

  popupWindow.webContents.once("did-finish-load", async () => {
    const snippet = text.length > 120 ? text.slice(0, 120) + "\u2026" : text;
    popupWindow.webContents.send("loading", snippet);
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send("loading");

    try {
      const analysis = await generateSessionAnalysis("", text);
      if (!popupWindow.isDestroyed())
        popupWindow.webContents.send("explanation", analysis.explanation);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("explanation", analysis.explanation);
        mainWindow.webContents.send("themes", analysis.themes);
        mainWindow.webContents.send("devices", analysis.devices);
        mainWindow.webContents.send("characters", analysis.characters);
      }
    } catch (err) {
      if (!popupWindow.isDestroyed())
        popupWindow.webContents.send("error", "Error: " + err.message);
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send("error", "Error: " + err.message);
    }
  });
}

ipcMain.on("close-popup", () => {
  if (popupWindow && !popupWindow.isDestroyed()) popupWindow.close();
});

ipcMain.on("open-app", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
  if (popupWindow && !popupWindow.isDestroyed()) popupWindow.close();
});

ipcMain.handle("speak-text", async (_event, text) => {
  const stream = await elevenlabs.textToSpeech.convert(
    "JBFqnCBsd6RMkjVDRZzb",
    { text, modelId: "eleven_multilingual_v2", outputFormat: "mp3_44100_128" }
  );
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("base64");
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
      characters: analysis.characters,
    };
  } catch (err) {
    return { ok: false, error: "Error: " + err.message };
  }
});

app.whenReady().then(() => {
  createMainWindow();

  lastSelection = clipboard.readText().trim();
  setInterval(() => {
    let sel = "";
    try {
      sel = clipboard.readText().trim();
    } catch {}
    if (sel && sel !== lastSelection && sel.length >= 5) {
      lastSelection = sel;
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send("selection", sel);
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => triggerExplain(sel), 600);
    }
  }, 300);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
