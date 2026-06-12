import { useEffect, useState, useCallback, useRef } from 'react';

import { useToastStore, type ToastItem } from './toastStore';

// ─── Toast Item ─────────────────────────────────────────────────────

function ToastItemView({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [isExiting, setIsExiting] = useState(false);
  const startY = useRef(0);
  const currentY = useRef(0);
  const isDragging = useRef(false);
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(onDismiss, 250);
    }, item.duration);
    return () => clearTimeout(timer);
  }, [item.duration, onDismiss]);

  const dismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(onDismiss, 250);
  }, [onDismiss]);

  // Swipe up to dismiss
  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    isDragging.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    currentY.current = e.touches[0].clientY;
    const delta = currentY.current - startY.current;
    if (delta < 0 && elRef.current) {
      elRef.current.style.transform = `translateY(${delta}px)`;
      elRef.current.style.opacity = String(Math.max(0, 1 + delta / 80));
    }
  };

  const handleTouchEnd = () => {
    isDragging.current = false;
    const delta = currentY.current - startY.current;
    if (delta < -30) {
      dismiss();
    } else if (elRef.current) {
      elRef.current.style.transform = '';
      elRef.current.style.opacity = '';
    }
  };

  return (
    <div
      ref={elRef}
      className={`toast-item ${isExiting ? 'toast-exit' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={dismiss}
      role="alert"
    >
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
        <ToastItemView key={item.id} item={item} onDismiss={() => handleDismiss(item.id)} />
      ))}
    </div>
  );
}
