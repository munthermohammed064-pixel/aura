"use client";

import { createContext, useCallback, useContext, useState, ReactNode } from "react";

type Toast = { id: number; text: string; kind: "ok" | "err" };

const ToastCtx = createContext<{ toast: (text: string, kind?: "ok" | "err") => void }>({
  toast: () => {},
});

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const toast = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    const id = nextId++;
    setItems((xs) => [...xs, { id, text, kind }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
        {items.map((x) => (
          <div key={x.id}
            className={`glass pointer-events-auto px-5 py-2.5 text-xs shadow-2xl transition-all ${
              x.kind === "err" ? "border-red-500/40 text-red-700" : "border-accent/40"
            }`}>
            {x.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
