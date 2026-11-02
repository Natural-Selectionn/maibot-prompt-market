"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { ArrowLeft } from "lucide-react";
import { MAIBOT_SESSION_KEY, maibotConfigUrl, normalizeMaibotOrigin, readMaibotEntry, readMaibotSession, type MaibotEntrySession } from "@/lib/maibot-bridge";

const MaibotContext = createContext<{ fromWebui: boolean; origin: string | null; setOrigin: (value: string | null) => void } | null>(null);

export function MaibotProvider({ children }: { children: ReactNode }) {
  const [entrySession, updateEntrySession] = useState<MaibotEntrySession | null>(null);
  const { setTheme } = useTheme();
  const saveEntrySession = useCallback((value: MaibotEntrySession | null) => {
    updateEntrySession(value);
    try {
      if (value) sessionStorage.setItem(MAIBOT_SESSION_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(MAIBOT_SESSION_KEY);
    } catch { /* The current visit still works when browser storage is disabled. */ }
  }, []);
  const setOrigin = useCallback((value: string | null) => {
    if (!entrySession) return;
    saveEntrySession({ source: "webui", origin: value === null ? null : normalizeMaibotOrigin(value) });
  }, [entrySession, saveEntrySession]);

  useEffect(() => {
    const receive = () => {
      const entry = readMaibotEntry(window.location.hash);
      if (!entry) {
        try { saveEntrySession(readMaibotSession(sessionStorage.getItem(MAIBOT_SESSION_KEY))); }
        catch { /* Keep the in-memory visit when browser storage is unavailable. */ }
        return;
      }
      saveEntrySession({ source: "webui", origin: entry.origin });
      if (entry.theme) setTheme(entry.theme);
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${entry.remainingHash}`);
    };
    receive();
    window.addEventListener("hashchange", receive);
    window.addEventListener("popstate", receive);
    return () => {
      window.removeEventListener("hashchange", receive);
      window.removeEventListener("popstate", receive);
    };
  }, [saveEntrySession, setTheme]);

  return <MaibotContext.Provider value={{ fromWebui: entrySession !== null, origin: entrySession?.origin ?? null, setOrigin }}>{children}</MaibotContext.Provider>;
}

export function useMaibot() {
  const value = useContext(MaibotContext);
  if (!value) throw new Error("MaibotProvider is required");
  return value;
}

export function MaibotReturnLink() {
  const { fromWebui, origin } = useMaibot();
  return fromWebui && origin && <a className="key icon-key" href={maibotConfigUrl(origin).href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label="返回 MaiBot" title={`返回 MaiBot：${origin}`}><ArrowLeft size={16}/></a>;
}
