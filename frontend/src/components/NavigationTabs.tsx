'use client';

import React from 'react';
import { Layers, Disc, Music, Activity, Radio, FolderHeart, Trophy, Sparkles, FolderArchive } from 'lucide-react';
import { TabId, Language, AccentColor } from '@/lib/types';
import { cn } from '@/lib/utils';
import { getTranslation } from '@/lib/translations';

interface NavigationTabsProps {
  currentTab: TabId;
  onSelectTab: (tab: TabId) => void;
  lang: Language;
  accentColor: AccentColor;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({
  currentTab,
  onSelectTab,
  lang,
  accentColor,
}) => {
  const t = (key: string) => getTranslation(lang, key);

  const modelTabs = [
    { id: 'roformer' as TabId, name: 'Roformer', badge: 'RECOMMENDED', icon: Layers },
    { id: 'mdx23c' as TabId, name: 'MDX23C', badge: 'HQ', icon: Disc },
    { id: 'mdxnet' as TabId, name: 'MDX-NET', badge: 'CLASSIC', icon: Music },
    { id: 'vrarch' as TabId, name: 'VR Arch', badge: 'VOCALS', icon: Activity },
    { id: 'demucs' as TabId, name: 'Demucs', badge: 'v4', icon: Radio },
  ];

  const toolTabs = [
    { id: 'batch' as TabId, name: 'Toplu İşlem', icon: FolderArchive },
    { id: 'library' as TabId, name: t('Library'), icon: FolderHeart },
    { id: 'leaderboard' as TabId, name: t('Leaderboard'), icon: Trophy },
  ];

  return (
    <nav className="w-full glass-panel p-2 rounded-3xl border border-white/[0.08] backdrop-blur-2xl flex flex-wrap items-center justify-between gap-3 shadow-2xl">
      {/* Model Architectures Group */}
      <div className="flex flex-wrap items-center gap-1.5">
        {modelTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={cn(
                'relative flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold font-outfit transition-all duration-200 active:scale-95 group overflow-hidden cursor-pointer whitespace-nowrap',
                isActive
                  ? cn(
                      'text-white shadow-xl',
                      accentColor === 'indigo' && 'bg-gradient-to-r from-indigo-600 to-indigo-700 shadow-indigo-500/30 ring-1 ring-indigo-400/50',
                      accentColor === 'emerald' && 'bg-gradient-to-r from-emerald-600 to-emerald-700 shadow-emerald-500/30 ring-1 ring-emerald-400/50',
                      accentColor === 'rose' && 'bg-gradient-to-r from-rose-600 to-rose-700 shadow-rose-500/30 ring-1 ring-rose-400/50',
                      accentColor === 'amber' && 'bg-gradient-to-r from-amber-600 to-amber-700 shadow-amber-500/30 ring-1 ring-amber-400/50',
                      accentColor === 'violet' && 'bg-gradient-to-r from-violet-600 to-violet-700 shadow-violet-500/30 ring-1 ring-violet-400/50'
                    )
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.05] border border-transparent'
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0 transition-transform group-hover:scale-110', isActive ? 'text-white' : 'text-slate-400')} />
              <span>{tab.name}</span>
              {tab.badge && (
                <span
                  className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded-md font-mono font-bold tracking-tight hidden md:inline transition-colors',
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-white/[0.06] text-slate-400 group-hover:text-slate-200'
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tools Group */}
      <div className="flex items-center gap-1.5 border-t sm:border-t-0 sm:border-l border-white/[0.08] pt-2 sm:pt-0 sm:pl-3 w-full sm:w-auto justify-end">
        {toolTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold font-outfit transition-all duration-300 active:scale-95 group',
                isActive
                  ? cn(
                      'text-white shadow-xl',
                      accentColor === 'indigo' && 'bg-gradient-to-r from-indigo-600 to-indigo-700 shadow-indigo-500/30 ring-1 ring-indigo-400/50',
                      accentColor === 'emerald' && 'bg-gradient-to-r from-emerald-600 to-emerald-700 shadow-emerald-500/30 ring-1 ring-emerald-400/50',
                      accentColor === 'rose' && 'bg-gradient-to-r from-rose-600 to-rose-700 shadow-rose-500/30 ring-1 ring-rose-400/50',
                      accentColor === 'amber' && 'bg-gradient-to-r from-amber-600 to-amber-700 shadow-amber-500/30 ring-1 ring-amber-400/50',
                      accentColor === 'violet' && 'bg-gradient-to-r from-violet-600 to-violet-700 shadow-violet-500/30 ring-1 ring-violet-400/50'
                    )
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.name}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
