"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { IconCheck } from "./icons";

type ToastItem = { id: string; msg: string; icon?: React.ReactNode };
type ToastFn = (msg: string, opts?: { icon?: React.ReactNode; duration?: number }) => void;

const ToastCtx = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback<ToastFn>((msg, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setItems(prev => [...prev, { id, msg, icon: opts.icon }]);
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), opts.duration ?? 2400);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-stack">
        {items.map(t => (
          <div key={t.id} className="toast fade-up">
            {t.icon ?? <IconCheck style={{ color: "var(--success)" }}/>}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
