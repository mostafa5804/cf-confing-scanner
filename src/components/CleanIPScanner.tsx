import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { Play, StopCircle, Download, Copy, ShieldCheck } from "lucide-react";
import { useAppContext } from "../context/AppContext";

const socket = io();

interface CleanIP {
  ip: string;
  latency: number;
}

export default function CleanIPScanner() {
  const { t } = useAppContext();
  const [ips, setIps] = useState<CleanIP[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanId, setScanId] = useState("");
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [mode, setMode] = useState<"quick" | "normal" | "full">("quick");

  useEffect(() => {
    socket.on(`clean-ip-found-${scanId}`, (data: CleanIP) => {
      setIps((prev) => [...prev, data].sort((a, b) => a.latency - b.latency));
    });

    socket.on(`clean-scan-progress-${scanId}`, (data: { processed: number; total: number }) => {
      setProcessed(data.processed);
      setTotal(data.total);
    });

    socket.on(`clean-scan-start-${scanId}`, (data: { total: number }) => {
      setTotal(data.total);
      setProcessed(0);
    });

    socket.on(`scan-complete-${scanId}`, () => {
      setScanning(false);
    });

    return () => {
      socket.off(`clean-ip-found-${scanId}`);
      socket.off(`clean-scan-progress-${scanId}`);
      socket.off(`clean-scan-start-${scanId}`);
      socket.off(`scan-complete-${scanId}`);
    };
  }, [scanId]);

  const startScan = async () => {
    setIps([]);
    setScanning(true);
    const id = Math.random().toString(36).substring(7);
    setScanId(id);

    await fetch("/api/scan/clean", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, id }),
    });
  };

  const stopScan = async () => {
    await fetch("/api/scan/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: scanId }),
    });
    setScanning(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <div>
            <h2 className="text-lg font-medium text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="text-emerald-500 dark:text-emerald-400" size={20} /> {t.cleanIpFinder}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {t.cleanIpDesc}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 w-full sm:w-auto">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
              disabled={scanning}
              className="flex-1 sm:flex-none bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500/50 shadow-sm"
            >
              <option value="quick">{t.quickScan}</option>
              <option value="normal">{t.normalScan}</option>
              <option value="full">{t.fullScan}</option>
            </select>
            <button
              onClick={startScan}
              disabled={scanning}
              className="flex-1 sm:flex-none bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              {scanning ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white" /> : <Play size={16} />}
              {scanning ? t.scanning : t.startScan}
            </button>
            {scanning && (
              <button
                onClick={stopScan}
                className="bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-500 dark:text-red-400 border border-red-200 dark:border-red-500/20 px-3 rounded-lg transition-colors"
              >
                <StopCircle size={20} />
              </button>
            )}
          </div>
        </div>

        {scanning && (
          <div className="mb-6 bg-slate-50 dark:bg-slate-950/50 rounded-lg p-4 border border-slate-200 dark:border-white/5">
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
              <span>{t.progress}</span>
              <span>{processed} / {total} {t.ipsChecked}</span>
            </div>
            <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${(processed / Math.max(total, 1)) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-lg overflow-hidden shadow-sm">
          <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-white/5 flex justify-between items-center">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t.foundIps} ({ips.length})</span>
            <div className="flex gap-2">
              <button className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-white/5 transition-colors">
                <Download size={14} /> {t.export}
              </button>
              <button className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-white/5 transition-colors">
                <Copy size={14} /> {t.copy}
              </button>
            </div>
          </div>
          <div className="max-h-[400px] overflow-auto">
            <table className="w-full text-left rtl:text-right text-sm">
              <thead className="bg-slate-100/50 dark:bg-slate-900/30 text-slate-600 dark:text-slate-500 sticky top-0 backdrop-blur-sm">
                <tr>
                  <th className="px-4 py-2 font-medium w-16">#</th>
                  <th className="px-4 py-2 font-medium">{t.ipAddress}</th>
                  <th className="px-4 py-2 font-medium text-center">{t.latency}</th>
                  <th className="px-4 py-2 font-medium text-center">{t.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                {ips.map((ip, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                    <td className="px-4 py-2 text-slate-500 dark:text-slate-600 font-mono text-xs">{i + 1}</td>
                    <td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-300">{ip.ip}</td>
                    <td className="px-4 py-2 text-center font-mono text-emerald-600 dark:text-emerald-400">{ip.latency.toFixed(0)}ms</td>
                    <td className="px-4 py-2 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                        {t.clean}
                      </span>
                    </td>
                  </tr>
                ))}
                {ips.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-slate-500 dark:text-slate-600 italic">
                      {t.noCleanIps}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
