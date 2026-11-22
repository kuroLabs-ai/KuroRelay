import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { cn } from "../../lib/cn";

type ToastVariant = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
}

interface ToastCtx {
  toast: (message: string, variant?: ToastVariant, duration?: number) => void;
}

const ToastContext = createContext<ToastCtx>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const icons: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle2 size={15} />,
  error:   <AlertCircle  size={15} />,
  info:    <Info         size={15} />,
  warning: <AlertTriangle size={15} />,
};

const variantStyle: Record<ToastVariant, string> = {
  success: "border-[var(--ok)]   text-[var(--ok)]",
  error:   "border-[var(--err)]  text-[var(--err)]",
  info:    "border-[var(--info)] text-[var(--info)]",
  warning: "border-[var(--warn)] text-[var(--warn)]",
};

function ToastItem({ t, onClose }: { t: Toast; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, t.duration ?? 4000);
    return () => clearTimeout(timer);
  }, [t.duration, onClose]);

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-[var(--r-md)] border px-3 py-2 text-xs shadow-lg",
        "bg-[var(--bg-s3)] fade-up",
        variantStyle[t.variant],
      )}
      style={{ minWidth: 220, maxWidth: 360 }}
    >
      <span className="mt-px shrink-0">{icons[t.variant]}</span>
      <span className="flex-1 text-[var(--tx-1)]">{t.message}</span>
      <button
        onClick={onClose}
        className="shrink-0 text-[var(--tx-3)] hover:text-[var(--tx-1)] transition-colors"
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((message: string, variant: ToastVariant = "info", duration = 4000) => {
    const id = String(idRef.current++);
    setToasts((prev) => [...prev, { id, message, variant, duration }]);
  }, []);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
        style={{ width: 360 }}
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem t={t} onClose={() => remove(t.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
