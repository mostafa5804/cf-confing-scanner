import { isIPv4 } from "net";

export interface Config {
  type: "vless" | "vmess";
  address: string;
  port: number;
  uuid: string;
  path: string;
  host: string; // SNI or Host header
  sni: string;
  tls: boolean;
  name: string;
  originalUri: string;
  ip?: string; // Resolved IP
}

export function parseConfig(uri: string): Config | null {
  uri = uri.trim();
  if (uri.startsWith("vless://")) {
    return parseVless(uri);
  } else if (uri.startsWith("vmess://")) {
    return parseVmess(uri);
  }
  return null;
}

function parseVless(uri: string): Config | null {
  try {
    const url = new URL(uri);
    const params = url.searchParams;
    return {
      type: "vless",
      address: url.hostname,
      port: parseInt(url.port) || 443,
      uuid: url.username,
      path: params.get("path") || "/",
      host: params.get("host") || params.get("sni") || url.hostname,
      sni: params.get("sni") || params.get("host") || url.hostname,
      tls: params.get("security") === "tls",
      name: decodeURIComponent(url.hash.slice(1)),
      originalUri: uri,
    };
  } catch (e) {
    return null;
  }
}

function parseVmess(uri: string): Config | null {
  try {
    const b64 = uri.slice(8);
    const jsonStr = Buffer.from(b64, "base64").toString("utf-8");
    const config = JSON.parse(jsonStr);
    return {
      type: "vmess",
      address: config.add,
      port: parseInt(config.port) || 443,
      uuid: config.id,
      path: config.path || "/",
      host: config.host || config.add,
      sni: config.sni || config.host || config.add,
      tls: config.tls === "tls",
      name: config.ps || "",
      originalUri: uri,
    };
  } catch (e) {
    return null;
  }
}

export const CF_SUBNETS = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
];

function ipToLong(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function longToIp(long: number): string {
  return [
    (long >>> 24) & 255,
    (long >>> 16) & 255,
    (long >>> 8) & 255,
    long & 255,
  ].join(".");
}

export function generateIPs(subnets: string[], sampleSize: number): string[] {
  const ips: string[] = [];
  for (const subnet of subnets) {
    const [ip, prefix] = subnet.split("/");
    const mask = -1 << (32 - parseInt(prefix, 10));
    const start = ipToLong(ip) & mask;
    const end = start | (~mask >>> 0);
    const count = end - start;

    if (sampleSize > 0) {
      for (let i = 0; i < sampleSize; i++) {
        const randomIp = longToIp(start + Math.floor(Math.random() * count));
        ips.push(randomIp);
      }
    } else {
      // Generate all IPs (careful!)
      // For "full" scan, we might generate millions.
      // We should probably use a generator or stream for full scan.
      // For now, let's limit to sampleSize or a reasonable max if 0.
      const limit = Math.min(count, 1000); // Default limit if sampleSize is 0 (safety)
      for (let i = 0; i < limit; i++) {
         ips.push(longToIp(start + i));
      }
    }
  }
  return ips;
}
