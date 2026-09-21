import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const app = express();
app.use(express.json({ limit: "20mb" }));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Demo persistent local JSON store.
// Production should use a real database and object storage.
const DATA = path.resolve("./beta-data");
const MEMORY_FILE = path.join(DATA, "memory.json");
const PDF_DIR = path.join(DATA, "pdfs");
fs.mkdirSync(PDF_DIR, { recursive: true });

function loadMemory() {
  try { return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8")); }
  catch { return {}; }
}
function saveMemory(data) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2));
}
function userId(req) {
  return String(req.headers["x-beta-user"] || "demo-user");
}

app.get("/health", (_req, res) => res.json({ ok: true, app: "Beta", version: "4.0" }));

app.get("/memory", (req, res) => {
  const all = loadMemory();
  res.json({ memories: all[userId(req)] || [] });
});

app.post("/memory", (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "text is required" });

  const all = loadMemory();
  const id = userId(req);
  all[id] = all[id] || [];
  all[id].push({ id: crypto.randomUUID(), text, createdAt: new Date().toISOString() });
  all[id] = all[id].slice(-200);
  saveMemory(all);
  res.json({ ok: true, memories: all[id] });
});

app.post("/chat", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ error: "message is required" });

    const all = loadMemory();
    const memories = all[userId(req)] || [];
    const context = memories.map(x => `- ${x.text}`).join("\n");

    const response = await client.responses.create({
      model: "gpt-5.6-luna",
      instructions:
        "You are Beta, a friendly Hindi/Hinglish personal AI assistant. " +
        "Use only the supplied memory as user context; never invent memories. " +
        (context ? `Known user memory:\n${context}` : "No saved user memory."),
      input: message,
      tools: [{ type: "web_search" }]
    });

    res.json({ reply: response.output_text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "AI request failed" });
  }
});

// Upload metadata endpoint. The Android app can send extracted text here.
// In production, replace with authenticated multipart uploads + file search.
app.post("/pdf", async (req, res) => {
  const name = String(req.body?.name || "document.txt");
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "text is required" });

  const id = crypto.randomUUID();
  fs.writeFileSync(path.join(PDF_DIR, `${id}.txt`), text, "utf8");
  res.json({ ok: true, documentId: id, name });
});

// Simple document Q&A over stored extracted text.
// This is intentionally a bounded starter; production should use vector/file search.
app.post("/pdf/ask", async (req, res) => {
  try {
    const documentId = String(req.body?.documentId || "");
    const question = String(req.body?.question || "").trim();
    if (!documentId || !question)
      return res.status(400).json({ error: "documentId and question are required" });

    const file = path.join(PDF_DIR, `${documentId}.txt`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: "document not found" });

    const text = fs.readFileSync(file, "utf8").slice(0, 120000);

    const response = await client.responses.create({
      model: "gpt-5.6-luna",
      instructions:
        "Answer only from the supplied document. If the answer is not in it, say so. " +
        "Reply in Hindi/Hinglish when the question is in Hindi/Hinglish.",
      input: `DOCUMENT:\n${text}\n\nQUESTION:\n${question}`
    });

    res.json({ answer: response.output_text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "PDF question failed" });
  }
});

// Voice architecture:
// Keep speech processing on a secure server in production.
// This endpoint intentionally returns instructions rather than exposing API secrets.
app.get("/voice/config", (_req, res) => {
  res.json({
    mode: "secure-server",
    message: "Use a short-lived server-issued session/token for realtime voice. Never ship an API key in the APK."
  });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Beta V3 backend listening on ${port}`));
