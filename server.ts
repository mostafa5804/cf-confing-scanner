import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { scanLatency, scanSpeed, scanCleanIPs, stopScan } from "./src/server/scanner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json());

  // SSE Connections Store
  const clients = new Map<string, express.Response>();

  app.get("/api/events/:id", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const id = req.params.id;
    clients.set(id, res);

    req.on("close", () => {
      clients.delete(id);
    });
  });

  const broadcast = (id: string, event: string, data: any) => {
    const client = clients.get(id);
    if (client) {
      client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  // API Routes
  app.post("/api/scan/latency", async (req, res) => {
    const { configs, id } = req.body;
    const emitter = { emit: (event: string, data: any) => broadcast(id, event, data) };
    scanLatency(configs, id, emitter as any);
    res.json({ status: "started", id });
  });

  app.post("/api/scan/speed", async (req, res) => {
    const { configs, id, rounds } = req.body;
    const emitter = { emit: (event: string, data: any) => broadcast(id, event, data) };
    scanSpeed(configs, id, rounds, emitter as any);
    res.json({ status: "started", id });
  });

  app.post("/api/scan/clean", async (req, res) => {
    const { mode, id } = req.body;
    const emitter = { emit: (event: string, data: any) => broadcast(id, event, data) };
    scanCleanIPs(mode, id, emitter as any);
    res.json({ status: "started", id });
  });

  app.post("/api/scan/stop", (req, res) => {
    const { id } = req.body;
    stopScan(id);
    res.json({ status: "stopped", id });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
