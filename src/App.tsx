import { useState } from "react";
import Scanner from "./components/Scanner";
import CleanIPScanner from "./components/CleanIPScanner";
import { motion } from "motion/react";
import { AppProvider, useAppContext } from "./context/AppContext";
import { Moon, Sun, Languages } from "lucide-react";

function AppContent() {
  const [activeTab, setActiveTab] = useState<"scanner" | "clean">("scanner");
  const { lang, setLang, theme, setTheme, t } = useAppContext();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-200 font-sans transition-colors duration-200 selection:bg-indigo-500/30">
      <header className="border-b border-slate-200 dark:border-white/10 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20">
              ⚡
            </div>
            <h1 className="text-lg font-semibold tracking-tight">
              {t.appTitle}
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <nav className="hidden sm:flex gap-1 bg-slate-100 dark:bg-slate-800/50 p-1 rounded-lg border border-slate-200 dark:border-white/5">
              <button
                onClick={() => setActiveTab("scanner")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === "scanner"
                    ? "bg-indigo-500 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/5"
                }`}
              >
                {t.configScanner}
              </button>
              <button
                onClick={() => setActiveTab("clean")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === "clean"
                    ? "bg-indigo-500 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/5"
                }`}
              >
                {t.cleanIpFinder}
              </button>
            </nav>

            <div className="flex items-center gap-2 border-l border-slate-200 dark:border-white/10 pl-4 ml-2 rtl:border-l-0 rtl:border-r rtl:pl-0 rtl:pr-4 rtl:mr-2">
              <button
                onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}
                className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors flex items-center gap-2"
                title={t.language}
              >
                <Languages size={18} />
                <span className="text-sm font-medium hidden sm:block">{lang === 'fa' ? 'EN' : 'فا'}</span>
              </button>
              <button
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                title={theme === 'light' ? t.darkMode : t.lightMode}
              >
                {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
              </button>
            </div>
          </div>
        </div>
        
        {/* Mobile Navigation */}
        <div className="sm:hidden border-t border-slate-200 dark:border-white/10 px-4 py-2 flex gap-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab("scanner")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === "scanner"
                  ? "bg-indigo-500 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
              }`}
            >
              {t.configScanner}
            </button>
            <button
              onClick={() => setActiveTab("clean")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === "clean"
                  ? "bg-indigo-500 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
              }`}
            >
              {t.cleanIpFinder}
            </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {activeTab === "scanner" ? <Scanner /> : <CleanIPScanner />}
        </motion.div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
