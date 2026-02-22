import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { scanLatency, scanSpeed, scanCleanIPs, stopScan } from "./src/server/scanner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Routes
  app.post("/api/scan/latency", async (req, res) => {
    const { configs, id } = req.body;
    scanLatency(configs, id, io);
    res.json({ status: "started", id });
  });

  app.post("/api/scan/speed", async (req, res) => {
    const { configs, id, rounds } = req.body;
    scanSpeed(configs, id, rounds, io);
    res.json({ status: "started", id });
  });

  app.post("/api/scan/clean", async (req, res) => {
    const { mode, id } = req.body;
    scanCleanIPs(mode, id, io);
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
    // Serve static files in production
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
