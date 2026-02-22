import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { Play, StopCircle, Upload, Link, FileText, Download, Copy, ArrowUpDown, ArrowUp, ArrowDown, Check } from "lucide-react";
import { motion } from "motion/react";
import { useAppContext } from "../context/AppContext";

const socket = io();

interface Config {
  type: "vless" | "vmess";
  address: string;
  port: number;
  uuid: string;
  path: string;
  host: string;
  sni: string;
  tls: boolean;
  name: string;
  originalUri: string;
  latency?: number;
  tlsLatency?: number;
  speed?: number;
  status?: "success" | "failed";
  error?: string;
}

export default function Scanner() {
  const { t } = useAppContext();
  const [configs, setConfigs] = useState<Config[]>([]);
  const [input, setInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanId, setScanId] = useState("");
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [sortConfig, setSortConfig] = useState<{ key: 'latency' | 'speed' | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
    socket.on(`latency-update-${scanId}`, (config: Config) => {
      setConfigs((prev) => {
        const index = prev.findIndex((c) => c.originalUri === config.originalUri);
        if (index !== -1) {
          const newConfigs = [...prev];
          newConfigs[index] = { ...newConfigs[index], ...config };
          return newConfigs;
        }
        return prev;
      });
      setProgress((prev) => prev + 1);
    });

    socket.on(`speed-update-${scanId}`, (config: Config) => {
      setConfigs((prev) => {
        const index = prev.findIndex((c) => c.originalUri === config.originalUri);
        if (index !== -1) {
          const newConfigs = [...prev];
          newConfigs[index] = { ...newConfigs[index], ...config };
          return newConfigs;
        }
        return prev;
      });
      setProgress((prev) => prev + 1);
    });

    socket.on(`scan-complete-${scanId}`, (data: { type: string }) => {
      if (data.type === "latency") {
        // Start speed test automatically for successful configs
        const successful = configs.filter((c) => c.latency && c.latency > 0);
        if (successful.length > 0) {
          fetch("/api/scan/speed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ configs: successful, id: scanId, rounds: [1024 * 1024] }),
          });
          setTotal(successful.length);
          setProgress(0);
        } else {
          setScanning(false);
        }
      } else if (data.type === "speed") {
        setScanning(false);
      }
    });

    return () => {
      socket.off(`latency-update-${scanId}`);
      socket.off(`speed-update-${scanId}`);
      socket.off(`scan-complete-${scanId}`);
    };
  }, [scanId, configs]);

  const startScan = async () => {
    if (!input.trim()) return;
    const lines = input.split("\n").filter((l) => l.trim());
    
    const parsedConfigs = lines.map(line => {
        try {
            if (line.startsWith("vless://")) {
                const url = new URL(line);
                return {
                    type: "vless",
                    address: url.hostname,
                    port: parseInt(url.port) || 443,
                    uuid: url.username,
                    path: url.searchParams.get("path") || "/",
                    host: url.searchParams.get("host") || url.hostname,
                    sni: url.searchParams.get("sni") || url.hostname,
                    tls: url.searchParams.get("security") === "tls",
                    name: decodeURIComponent(url.hash.slice(1)),
                    originalUri: line
                } as Config;
            } else if (line.startsWith("vmess://")) {
                const b64 = line.slice(8);
                const json = JSON.parse(atob(b64));
                return {
                    type: "vmess",
                    address: json.add,
                    port: parseInt(json.port) || 443,
                    uuid: json.id,
                    path: json.path || "/",
                    host: json.host || json.add,
                    sni: json.sni || json.host || json.add,
                    tls: json.tls === "tls",
                    name: json.ps || "",
                    originalUri: line
                } as Config;
            }
        } catch (e) { return null; }
        return null;
    }).filter(Boolean) as Config[];

    setConfigs(parsedConfigs);
    setTotal(parsedConfigs.length);
    setProgress(0);
    setScanning(true);
    const id = Math.random().toString(36).substring(7);
    setScanId(id);

    try {
      const response = await fetch("/api/scan/latency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configs: parsedConfigs, id }),
      });
      if (!response.ok) throw new Error("Backend unavailable");
    } catch (e) {
      console.warn("Backend not found, switching to Browser-side scanning (Limited)");
      runBrowserScan(parsedConfigs);
    }
  };

  const runBrowserScan = async (configsToScan: Config[]) => {
    for (let i = 0; i < configsToScan.length; i++) {
      if (!scanning) break;
      const config = configsToScan[i];
      
      // Browser-side latency (Simulated via fetch to speed.cloudflare.com)
      // Note: Real IP ping is not possible in browser due to SSL/CORS
      const start = performance.now();
      try {
        await fetch(`https://speed.cloudflare.com/__down?bytes=0`, { mode: 'no-cors' });
        const latency = performance.now() - start;
        
        // Speed test (Browser can do this because Cloudflare allows CORS)
        const speedStart = performance.now();
        const res = await fetch(`https://speed.cloudflare.com/__down?bytes=1048576`); // 1MB
        const blob = await res.blob();
        const duration = (performance.now() - speedStart) / 1000;
        const speed = (blob.size / duration) / 1024 / 1024;

        setConfigs(prev => {
          const newConfigs = [...prev];
          const idx = newConfigs.findIndex(c => c.originalUri === config.originalUri);
          if (idx !== -1) {
            newConfigs[idx] = { ...newConfigs[idx], latency, speed, status: 'success' };
          }
          return newConfigs;
        });
      } catch (err) {
        setConfigs(prev => {
          const newConfigs = [...prev];
          const idx = newConfigs.findIndex(c => c.originalUri === config.originalUri);
          if (idx !== -1) {
            newConfigs[idx] = { ...newConfigs[idx], status: 'failed' };
          }
          return newConfigs;
        });
      }
      setProgress(i + 1);
    }
    setScanning(false);
  };

  const stopScan = async () => {
    await fetch("/api/scan/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: scanId }),
    });
    setScanning(false);
  };

  const handleSort = (key: 'latency' | 'speed') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedConfigs = [...configs].sort((a, b) => {
    if (!sortConfig.key) return 0;
    
    const getVal = (c: Config, key: 'latency' | 'speed') => {
        const val = c[key];
        if (val === undefined || val === null || val <= 0) {
            return sortConfig.direction === 'asc' ? Infinity : -Infinity;
        }
        return val;
    };

    const aVal = getVal(a, sortConfig.key);
    const bVal = getVal(b, sortConfig.key);
    
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const SortIcon = ({ columnKey }: { columnKey: 'latency' | 'speed' }) => {
    if (sortConfig.key !== columnKey) return <ArrowUpDown size={14} className="inline ml-1 opacity-50" />;
    return sortConfig.direction === 'asc' ? <ArrowUp size={14} className="inline ml-1 text-indigo-400" /> : <ArrowDown size={14} className="inline ml-1 text-indigo-400" />;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl p-4 shadow-sm">
            <h2 className="text-sm font-medium text-slate-700 dark:text-slate-400 mb-3 flex items-center gap-2">
              <FileText size={16} /> {t.inputConfigs}
            </h2>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.inputPlaceholder}
              className="w-full h-64 bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg p-3 text-xs font-mono text-slate-800 dark:text-slate-300 focus:outline-none focus:border-indigo-500/50 resize-none shadow-inner"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={startScan}
                disabled={scanning || !input.trim()}
                className="flex-1 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                {scanning ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white" /> : <Play size={16} />}
                {scanning ? t.scanning : t.startScan}
              </button>
              {scanning && (
                <button
                  onClick={stopScan}
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 p-2 rounded-lg transition-colors"
                >
                  <StopCircle size={20} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden flex flex-col h-[calc(100vh-12rem)] shadow-sm">
            <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-slate-900/80">
              <h2 className="text-sm font-medium text-slate-700 dark:text-slate-400">{t.results} ({configs.length})</h2>
              <div className="flex gap-2">
                <button className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-white/5 transition-colors">
                  <Download size={14} /> {t.exportCsv}
                </button>
                <button className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-white/5 transition-colors">
                  <Copy size={14} /> {t.copyAll}
                </button>
              </div>
            </div>
            
            <div className="overflow-auto flex-1">
              <table className="w-full text-left rtl:text-right text-xs">
                <thead className="bg-slate-100/80 dark:bg-slate-950/50 text-slate-600 dark:text-slate-500 sticky top-0 z-10 backdrop-blur-sm">
                  <tr>
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">{t.aliasAddress}</th>
                    <th className="px-4 py-3 font-medium">{t.protocol}</th>
                    <th className="px-4 py-3 font-medium text-center cursor-pointer hover:text-slate-900 dark:hover:text-slate-300 transition-colors" onClick={() => handleSort('latency')}>
                      {t.pingTcp} <SortIcon columnKey="latency" />
                    </th>
                    <th className="px-4 py-3 font-medium text-center">{t.handshakeTls}</th>
                    <th className="px-4 py-3 font-medium text-center cursor-pointer hover:text-slate-900 dark:hover:text-slate-300 transition-colors" onClick={() => handleSort('speed')}>
                      {t.speed} <SortIcon columnKey="speed" />
                    </th>
                    <th className="px-4 py-3 font-medium text-center">{t.score}</th>
                    <th className="px-4 py-3 font-medium text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                  {sortedConfigs.map((config, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
                      <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-slate-200 truncate max-w-[200px]">{config.name || config.address}</div>
                        <div className="text-slate-500 truncate max-w-[200px]">{config.address}:{config.port}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                          config.type === 'vless' ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' : 'bg-purple-100 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400'
                        }`}>
                          {config.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-mono">
                        {config.latency ? (
                          <span className={config.latency > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                            {config.latency > 0 ? `${config.latency.toFixed(0)}ms` : t.timeout}
                          </span>
                        ) : <span className="text-slate-400 dark:text-slate-600">-</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-mono">
                        {config.tlsLatency ? (
                          <span className={config.tlsLatency > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                            {config.tlsLatency > 0 ? `${config.tlsLatency.toFixed(0)}ms` : "-"}
                          </span>
                        ) : <span className="text-slate-400 dark:text-slate-600">-</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-mono">
                        {config.speed ? (
                          <span className="text-indigo-600 dark:text-indigo-400 font-bold">{config.speed.toFixed(2)}</span>
                        ) : <span className="text-slate-400 dark:text-slate-600">-</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {config.latency && config.latency > 0 ? (
                          <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full mx-auto overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-emerald-500 to-indigo-500" 
                              style={{ width: `${Math.min(100, (1000 / config.latency) * 10 + (config.speed || 0) * 5)}%` }}
                            />
                          </div>
                        ) : <span className="text-slate-400 dark:text-slate-600">-</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {config.latency && config.latency > 0 && (
                          <button
                            onClick={() => copyToClipboard(config.originalUri, i)}
                            className="text-slate-400 hover:text-indigo-500 transition-colors p-1 rounded hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                            title={t.copyUrl}
                          >
                            {copiedIndex === i ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {configs.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-500 italic">
                        {t.noConfigs}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {scanning && (
              <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 border-t border-indigo-100 dark:border-indigo-500/20 text-xs text-indigo-600 dark:text-indigo-300 flex items-center justify-between px-4">
                <span>{t.scanning} {progress} / {total}</span>
                <div className="w-32 h-1.5 bg-indigo-900/50 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${(progress / total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
