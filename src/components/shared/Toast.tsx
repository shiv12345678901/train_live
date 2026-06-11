import { useEffect, useState, useCallback } from 'react';
import { create } from 'zustand';

// ─── Toast Store ────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastStore {
  toasts: ToastItem[];
  addToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>()((set) => ({
  toasts: [],
  addToast: (message, type = 'success', duration = 3000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((state) => ({ toasts: [...state.toasts.slice(-4), { id, message, type, duration }] }));
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));

// Convenience function for use outside React components
export function toast(message: string, type?: ToastType, duration?: number) {
  useToastStore.getState().addToast(message, type, duration);
}

// ─── Toast Item Component ───────────────────────────────────────────

function ToastItem({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(onDismiss, 300);
    }, item.duration);
    return () => clearTimeout(timer);
  }, [item.duration, onDismiss]);

  const iconMap = {
    success: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
    error: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M15 9l-6 6M9 9l6 6" />
      </svg>
    ),
    info: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" />
      </svg>
    ),
  };

  return (
    <div
      className={`toast-item toast-item--${item.type} ${isExiting ? 'toast-item--exit' : ''}`}
      onClick={() => { setIsExiting(true); setTimeout(onDismiss, 300); }}
      role="alert"
    >
      <span className="toast-icon">{iconMap[item.type]}</span>
      <span className="toast-message">{item.message}</span>
    </div>
  );
}

// ─── Toast Container ────────────────────────────────────────────────

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  const handleDismiss = useCallback((id: string) => {
    removeToast(id);
  }, [removeToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((item) => (
        <ToastItem key={item.id} item={item} onDismiss={() => handleDismiss(item.id)} />
      ))}
    </div>
  );
}
