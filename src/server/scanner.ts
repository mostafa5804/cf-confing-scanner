import { Server } from "socket.io";
import { Config, parseConfig, generateIPs, CF_SUBNETS } from "./utils.js";
import net from "net";
import tls from "tls";
import https from "https";
import pLimit from "p-limit";

const activeScans = new Map<string, AbortController>();

export function stopScan(id: string) {
  const controller = activeScans.get(id);
  if (controller) {
    controller.abort();
    activeScans.delete(id);
  }
}

export async function scanLatency(configs: Config[], id: string, io: Server) {
  const controller = new AbortController();
  activeScans.set(id, controller);
  const limit = pLimit(50); // Concurrency limit

  const tasks = configs.map((config) =>
    limit(async () => {
      if (controller.signal.aborted) return;

      const start = performance.now();
      try {
        await new Promise<void>((resolve, reject) => {
          const socket = net.connect(config.port, config.address, () => {
            socket.end();
            resolve();
          });
          socket.on("error", reject);
          socket.setTimeout(2000, () => {
            socket.destroy();
            reject(new Error("Timeout"));
          });
        });
        const tcpTime = performance.now() - start;

        const tlsStart = performance.now();
        await new Promise<void>((resolve, reject) => {
          const socket = tls.connect(
            config.port,
            config.address,
            { servername: config.sni, rejectUnauthorized: false },
            () => {
              socket.end();
              resolve();
            }
          );
          socket.on("error", reject);
          socket.setTimeout(2000, () => {
            socket.destroy();
            reject(new Error("Timeout"));
          });
        });
        const tlsTime = performance.now() - tlsStart;

        io.emit(`latency-update-${id}`, {
          ...config,
          latency: tcpTime,
          tlsLatency: tlsTime,
          status: "success",
        });
      } catch (e) {
        io.emit(`latency-update-${id}`, {
          ...config,
          latency: -1,
          tlsLatency: -1,
          status: "failed",
          error: (e as Error).message,
        });
      }
    })
  );

  await Promise.all(tasks);
  activeScans.delete(id);
  io.emit(`scan-complete-${id}`, { type: "latency" });
}

export async function scanSpeed(configs: Config[], id: string, rounds: number[], io: Server) {
  const controller = new AbortController();
  activeScans.set(id, controller);
  const limit = pLimit(5); // Lower concurrency for speed test

  const tasks = configs.map((config) =>
    limit(async () => {
      if (controller.signal.aborted) return;

      try {
        const speed = await testDownloadSpeed(config, rounds[0] || 1024 * 1024); // Default 1MB
        io.emit(`speed-update-${id}`, {
          ...config,
          speed,
          status: "success",
        });
      } catch (e) {
        io.emit(`speed-update-${id}`, {
          ...config,
          speed: -1,
          status: "failed",
          error: (e as Error).message,
        });
      }
    })
  );

  await Promise.all(tasks);
  activeScans.delete(id);
  io.emit(`scan-complete-${id}`, { type: "speed" });
}

async function testDownloadSpeed(config: Config, size: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    let downloaded = 0;
    const req = https.request(
      {
        hostname: config.address, // Connect to this IP
        port: config.port,
        path: `/__down?bytes=${size}`,
        method: "GET",
        headers: {
          Host: "speed.cloudflare.com", // SNI/Host header
          "User-Agent": "Mozilla/5.0",
        },
        servername: "speed.cloudflare.com", // SNI
        rejectUnauthorized: false,
        timeout: 10000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        res.on("data", (chunk) => {
          downloaded += chunk.length;
        });
        res.on("end", () => {
          const duration = (performance.now() - start) / 1000; // seconds
          const speed = downloaded / duration / 1024 / 1024; // MB/s
          resolve(speed);
        });
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
    req.end();
  });
}

export async function scanCleanIPs(mode: string, id: string, io: Server) {
  const controller = new AbortController();
  activeScans.set(id, controller);
  const limit = pLimit(100); // High concurrency for IP scanning

  // Generate IPs based on mode
  // Quick: ~700 IPs
  // Normal: ~2800 IPs
  // Full: ~14000 IPs
  let sampleSize = 50;
  if (mode === "normal") sampleSize = 200;
  if (mode === "full") sampleSize = 1000;

  const ips = generateIPs(CF_SUBNETS, sampleSize);
  
  io.emit(`clean-scan-start-${id}`, { total: ips.length });

  let processed = 0;
  const tasks = ips.map((ip) =>
    limit(async () => {
      if (controller.signal.aborted) return;

      try {
        const start = performance.now();
        await new Promise<void>((resolve, reject) => {
          const socket = tls.connect(
            443,
            ip,
            { servername: "speed.cloudflare.com", rejectUnauthorized: false },
            () => {
              socket.end();
              resolve();
            }
          );
          socket.on("error", reject);
          socket.setTimeout(2000, () => {
            socket.destroy();
            reject(new Error("Timeout"));
          });
        });
        const latency = performance.now() - start;

        io.emit(`clean-ip-found-${id}`, { ip, latency });
      } catch (e) {
        // Ignore failures
      } finally {
        processed++;
        if (processed % 100 === 0) {
            io.emit(`clean-scan-progress-${id}`, { processed, total: ips.length });
        }
      }
    })
  );

  await Promise.all(tasks);
  activeScans.delete(id);
  io.emit(`scan-complete-${id}`, { type: "clean" });
}
