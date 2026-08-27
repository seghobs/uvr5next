'use client';

import React from 'react';
import { Cpu, Settings, Globe, Sparkles, Radio, CloudDownload } from 'lucide-react';
import { Language, AccentColor } from '@/lib/types';
import { cn } from '@/lib/utils';
import { getTranslation } from '@/lib/translations';

interface HeaderProps {
  lang: Language;
  onToggleLang: () => void;
  accentColor: AccentColor;
  onChangeAccent: (color: AccentColor) => void;
  onOpenSettings: () => void;
  onOpenModelHub?: () => void;
  device: string;
}

const accentColors: { id: AccentColor; name: string; bgClass: string; glowClass: string }[] = [
  { id: 'indigo', name: 'Indigo', bgClass: 'bg-indigo-500', glowClass: 'shadow-indigo-500/50' },
  { id: 'emerald', name: 'Emerald', bgClass: 'bg-emerald-500', glowClass: 'shadow-emerald-500/50' },
  { id: 'rose', name: 'Rose', bgClass: 'bg-rose-500', glowClass: 'shadow-rose-500/50' },
  { id: 'amber', name: 'Amber', bgClass: 'bg-amber-500', glowClass: 'shadow-amber-500/50' },
  { id: 'violet', name: 'Violet', bgClass: 'bg-violet-500', glowClass: 'shadow-violet-500/50' },
];

export const Header: React.FC<HeaderProps> = ({
  lang,
  onToggleLang,
  accentColor,
  onChangeAccent,
  onOpenSettings,
  onOpenModelHub,
  device,
}) => {
  const t = (key: string) => getTranslation(lang, key);

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-2xl bg-slate-950/70 border-b border-white/[0.08] px-6 lg:px-10 py-3.5 transition-all">
      <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-6">
        {/* Brand Logo & Tag */}
        <div className="flex items-center gap-4">
          <div className="relative group cursor-pointer">
            <div
              className={cn(
                'w-11 h-11 rounded-2xl flex items-center justify-center shadow-xl transition-all duration-300 group-hover:scale-105',
                accentColor === 'indigo' && 'bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-indigo-500/30',
                accentColor === 'emerald' && 'bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-emerald-500/30',
                accentColor === 'rose' && 'bg-gradient-to-br from-rose-500 to-rose-700 shadow-rose-500/30',
                accentColor === 'amber' && 'bg-gradient-to-br from-amber-500 to-amber-700 shadow-amber-500/30',
                accentColor === 'violet' && 'bg-gradient-to-br from-violet-500 to-violet-700 shadow-violet-500/30'
              )}
            >
              <Sparkles className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-slate-950 flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl lg:text-2xl font-black tracking-tight text-white font-outfit">
                UVR5
              </h1>
              <span
                className={cn(
                  'text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-widest border backdrop-blur-md shadow-sm',
                  accentColor === 'indigo' && 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30 shadow-indigo-500/20',
                  accentColor === 'emerald' && 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-emerald-500/20',
                  accentColor === 'rose' && 'bg-rose-500/15 text-rose-300 border-rose-500/30 shadow-rose-500/20',
                  accentColor === 'amber' && 'bg-amber-500/15 text-amber-300 border-amber-500/30 shadow-amber-500/20',
                  accentColor === 'violet' && 'bg-violet-500/15 text-violet-300 border-violet-500/30 shadow-violet-500/20'
                )}
              >
                PRO STUDIO
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium tracking-wide hidden sm:block">
              AI Audio Source Separation & Real-time Web DAW
            </p>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-3">
          {/* Hardware Device Badge */}
          <div className="hidden md:flex items-center gap-2.5 px-3.5 py-1.5 rounded-2xl glass-panel text-xs text-slate-200 border border-white/5 shadow-inner">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <Cpu className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-mono font-medium text-[11px]">{device}</span>
          </div>

          {/* Accent Color Palette */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl glass-panel border border-white/5">
            {accentColors.map((col) => (
              <button
                key={col.id}
                onClick={() => onChangeAccent(col.id)}
                title={col.name}
                className={cn(
                  'w-5 h-5 rounded-xl transition-all duration-300 active:scale-90 relative flex items-center justify-center',
                  col.bgClass,
                  accentColor === col.id
                    ? cn('scale-110 shadow-lg ring-2 ring-white/80', col.glowClass)
                    : 'opacity-40 hover:opacity-100 hover:scale-105'
                )}
              />
            ))}
          </div>

          {/* Model Hub Trigger */}
          {onOpenModelHub && (
            <button
              onClick={onOpenModelHub}
              title="Model İndirme & Yönetim Merkezi"
              className="p-2.5 rounded-2xl glass-panel hover:bg-white/[0.08] border border-white/10 text-slate-300 hover:text-white transition-all duration-200 active:scale-95 shadow-sm flex items-center gap-1.5"
            >
              <CloudDownload className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-bold font-outfit hidden lg:inline">Modeller</span>
            </button>
          )}

          {/* Language Switcher */}
          <button
            onClick={onToggleLang}
            className="flex items-center gap-2 px-3.5 py-2 rounded-2xl glass-panel hover:bg-white/[0.08] border border-white/10 text-xs font-bold text-slate-200 transition-all duration-200 active:scale-95 shadow-sm"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-400" />
            <span className="font-mono">{lang.toUpperCase()}</span>
          </button>

          {/* Settings Trigger */}
          <button
            onClick={onOpenSettings}
            title={t('Global Settings')}
            className="p-2.5 rounded-2xl glass-panel hover:bg-white/[0.08] border border-white/10 text-slate-300 hover:text-white transition-all duration-200 active:scale-95 shadow-sm hover:rotate-45"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
