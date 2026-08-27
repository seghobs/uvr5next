'use client';

import React from 'react';
import { X, Cpu, Sliders, CheckCircle2 } from 'lucide-react';
import { Language, AccentColor, SeparationParams } from '@/lib/types';
import { cn } from '@/lib/utils';
import { getTranslation } from '@/lib/translations';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  accentColor: AccentColor;
  device: string;
  onChangeDevice: (dev: string) => void;
  params: SeparationParams;
  onChangeParams: (params: SeparationParams) => void;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  lang,
  accentColor,
  device,
  onChangeDevice,
  params,
  onChangeParams,
  onNotify,
}) => {
  const t = (key: string) => getTranslation(lang, key);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-bold font-outfit text-white">{t('Global Settings')}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Compute Device */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
            {t('Compute Device')}
          </label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: 'CUDA (Auto)', label: 'NVIDIA CUDA (Auto)', desc: 'GPU Accelerated' },
              { id: 'CPU', label: 'CPU (Direct)', desc: 'Compatibility Mode' },
            ].map((dev) => (
              <button
                key={dev.id}
                type="button"
                onClick={() => onChangeDevice(dev.id)}
                className={cn(
                  'p-3.5 rounded-2xl border text-left transition-all',
                  device === dev.id
                    ? 'bg-indigo-600/20 border-indigo-500 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                )}
              >
                <div className="flex items-center gap-2 font-bold text-xs">
                  <Cpu className="w-4 h-4 text-indigo-400" />
                  <span>{dev.label}</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block font-mono">{dev.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Audio Normalization Thresholds */}
        <div className="space-y-4 pt-2 border-t border-slate-800">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
            {t('Processing Parameters')}
          </label>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-300">
              <span>Normalization Threshold</span>
              <span className="font-mono font-bold text-white">{params.normalization_threshold}</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="1.0"
              step="0.05"
              value={params.normalization_threshold}
              onChange={(e) =>
                onChangeParams({ ...params, normalization_threshold: parseFloat(e.target.value) })
              }
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-300">
              <span>Amplification Threshold</span>
              <span className="font-mono font-bold text-white">{params.amplification_threshold}</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="1.0"
              step="0.05"
              value={params.amplification_threshold}
              onChange={(e) =>
                onChangeParams({ ...params, amplification_threshold: parseFloat(e.target.value) })
              }
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>
        </div>

        {/* Save & Close Button */}
        <button
          onClick={() => {
            onClose();
            onNotify('success', 'Settings Saved');
          }}
          className={cn(
            'w-full py-3.5 rounded-2xl font-bold text-xs text-white shadow-xl transition-transform active:scale-95 flex items-center justify-center gap-2',
            accentColor === 'indigo' && 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/25',
            accentColor === 'emerald' && 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/25',
            accentColor === 'rose' && 'bg-rose-600 hover:bg-rose-500 shadow-rose-500/25',
            accentColor === 'amber' && 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/25',
            accentColor === 'violet' && 'bg-violet-600 hover:bg-violet-500 shadow-violet-500/25'
          )}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{t('Save & Close')}</span>
        </button>
      </div>
    </div>
  );
};
