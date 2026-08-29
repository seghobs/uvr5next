'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Layers, Disc, Music, Activity, Radio, FolderHeart, Trophy, FolderArchive } from 'lucide-react';
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
    { id: 'roformer' as TabId, name: 'Roformer', badge: 'PRO', icon: Layers },
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

  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number } | null>(null);
  const tabRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  const updateIndicator = () => {
    const activeEl = tabRefs.current[currentTab];
    if (activeEl) {
      setIndicatorStyle({
        left: activeEl.offsetLeft,
        width: activeEl.offsetWidth,
      });
    }
  };

  useEffect(() => {
    updateIndicator();
    // Run after a tick to ensure layout is measured accurately
    const timer = setTimeout(updateIndicator, 50);
    window.addEventListener('resize', updateIndicator);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateIndicator);
    };
  }, [currentTab, lang]);

  return (
    <nav
      className="relative w-full glass-panel p-1.5 rounded-2xl border border-white/[0.08] backdrop-blur-2xl flex items-center justify-between gap-2 shadow-2xl overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
    >
      {/* Smooth Magnetic Sliding Indicator Pill */}
      {indicatorStyle && (
        <div
          className={cn(
            'absolute top-1.5 bottom-1.5 rounded-xl pointer-events-none transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] shadow-lg z-0',
            accentColor === 'indigo' && 'bg-gradient-to-r from-indigo-600 to-indigo-700 shadow-indigo-500/30 ring-1 ring-indigo-400/50',
            accentColor === 'emerald' && 'bg-gradient-to-r from-emerald-600 to-emerald-700 shadow-emerald-500/30 ring-1 ring-emerald-400/50',
            accentColor === 'rose' && 'bg-gradient-to-r from-rose-600 to-rose-700 shadow-rose-500/30 ring-1 ring-rose-400/50',
            accentColor === 'amber' && 'bg-gradient-to-r from-amber-600 to-amber-700 shadow-amber-500/30 ring-1 ring-amber-400/50',
            accentColor === 'violet' && 'bg-gradient-to-r from-violet-600 to-violet-700 shadow-violet-500/30 ring-1 ring-violet-400/50'
          )}
          style={{
            left: `${indicatorStyle.left}px`,
            width: `${indicatorStyle.width}px`,
          }}
        />
      )}

      {/* Model Architectures Group */}
      <div className="flex items-center gap-1 shrink-0 z-10">
        {modelTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;

          return (
            <button
              key={tab.id}
              ref={(el) => { tabRefs.current[tab.id] = el; }}
              onClick={() => onSelectTab(tab.id)}
              className={cn(
                'relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold font-outfit transition-colors duration-200 active:scale-95 group shrink-0 whitespace-nowrap cursor-pointer',
                isActive
                  ? 'text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0 transition-transform group-hover:scale-110', isActive ? 'text-white' : 'text-slate-400')} />
              <span>{tab.name}</span>
              {tab.badge && (
                <span
                  className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded-md font-mono font-bold tracking-tight transition-colors',
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

      {/* Vertical Divider */}
      <div className="h-5 w-px bg-white/10 shrink-0 mx-0.5 hidden sm:block z-10" />

      {/* Tools Group */}
      <div className="flex items-center gap-1 shrink-0 z-10">
        {toolTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;

          return (
            <button
              key={tab.id}
              ref={(el) => { tabRefs.current[tab.id] = el; }}
              onClick={() => onSelectTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold font-outfit transition-colors duration-200 active:scale-95 group shrink-0 whitespace-nowrap cursor-pointer',
                isActive
                  ? 'text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0 transition-transform group-hover:scale-110', isActive ? 'text-white' : 'text-slate-400')} />
              <span>{tab.name}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
