'use client';

import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-md w-full pointer-events-none">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';
        const isWarning = toast.type === 'warning';

        return (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto p-4 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-start gap-3 transition-all duration-300 transform translate-y-0 opacity-100',
              isSuccess && 'bg-emerald-950/90 border-emerald-500/30 text-emerald-200',
              isError && 'bg-rose-950/90 border-rose-500/30 text-rose-200',
              isWarning && 'bg-amber-950/90 border-amber-500/30 text-amber-200',
              !isSuccess && !isError && !isWarning && 'bg-slate-900/90 border-slate-700/50 text-slate-200'
            )}
          >
            <div className="mt-0.5 shrink-0">
              {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
              {isError && <XCircle className="w-5 h-5 text-rose-400" />}
              {isWarning && <AlertTriangle className="w-5 h-5 text-amber-400" />}
              {!isSuccess && !isError && !isWarning && <Info className="w-5 h-5 text-indigo-400" />}
            </div>

            <div className="flex-1 min-w-0">
              <h5 className="font-bold text-sm text-white truncate">{toast.title}</h5>
              {toast.message && (
                <p className="text-xs text-slate-300/90 mt-0.5 break-words">{toast.message}</p>
              )}
            </div>

            <button
              onClick={() => onDismiss(toast.id)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
