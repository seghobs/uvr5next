'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  Link as LinkIcon,
  Search,
  Music,
  X,
  Play,
  Loader2,
  CheckCircle2,
  Youtube,
  Radio,
  FileAudio,
  Sparkles,
} from 'lucide-react';
import { Language, AccentColor, SearchResult } from '@/lib/types';
import { cn, formatBytes, formatTime } from '@/lib/utils';
import { getTranslation } from '@/lib/translations';
import { api } from '@/lib/api';

export interface UploadedItem {
  id: string;
  name: string;
  size?: number;
  path: string;
  file?: File;
}

interface UploadZoneProps {
  queue: UploadedItem[];
  onAddToQueue: (items: UploadedItem[]) => void;
  onRemoveFromQueue: (id: string) => void;
  onClearQueue: () => void;
  isProcessing: boolean;
  onStartSeparation: () => void;
  lang: Language;
  accentColor: AccentColor;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  queue,
  onAddToQueue,
  onRemoveFromQueue,
  onClearQueue,
  isProcessing,
  onStartSeparation,
  lang,
  accentColor,
  onNotify,
}) => {
  const t = (key: string) => getTranslation(lang, key);
  const [isDragOver, setIsDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isDownloadingUrl, setIsDownloadingUrl] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchLimit, setSearchLimit] = useState(15);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastQueryRef = useRef<string>('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const items: UploadedItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const res = await api.uploadAudio(file);
        items.push({
          id: `${Date.now()}-${i}`,
          name: file.name,
          size: file.size,
          path: res.path,
          file,
        });
      } catch (e: any) {
        onNotify('error', 'Upload Failed', file.name + ': ' + (e.message || 'Unknown error'));
      }
    }

    if (items.length > 0) {
      onAddToQueue(items);
      onNotify('success', `${items.length} ${t('files added to queue')}`);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleUrlDownload = async () => {
    if (!urlInput.trim()) return;
    setIsDownloadingUrl(true);
    try {
      const res = await api.downloadFromUrl(urlInput.trim());
      onAddToQueue([
        {
          id: `${Date.now()}`,
          name: res.title || res.filename,
          path: res.path,
        },
      ]);
      setUrlInput('');
      onNotify('success', 'Download Complete', res.title || res.filename);
    } catch (e: any) {
      onNotify('error', 'Download Failed', e.message || 'Could not fetch audio from URL');
    } finally {
      setIsDownloadingUrl(false);
    }
  };

  const executeSearch = async (queryText: string, limit = 15) => {
    const trimmed = queryText.trim();
    if (!trimmed || trimmed.length < 2) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      setIsSearching(false);
      return;
    }

    lastQueryRef.current = trimmed;
    setSearchLimit(limit);
    setIsSearching(true);

    try {
      const res = await api.search(trimmed, limit);
      // Ensure this response matches the very latest query
      if (lastQueryRef.current === trimmed) {
        const list = Array.isArray(res) ? res : [];
        setSearchResults(list);
        setShowSearchDropdown(list.length > 0);
        setHasMore(list.length >= limit && limit < 45);
      }
    } catch (e) {
      if (lastQueryRef.current === trimmed) {
        console.error('YouTube search error:', e);
        setSearchResults([]);
      }
    } finally {
      if (lastQueryRef.current === trimmed) {
        setIsSearching(false);
      }
    }
  };

  const loadMoreResults = async () => {
    if (isLoadingMore || !hasMore || isSearching || !searchQuery.trim()) return;
    const nextLimit = Math.min(45, searchLimit + 12);
    if (nextLimit === searchLimit) {
      setHasMore(false);
      return;
    }

    setIsLoadingMore(true);
    try {
      const res = await api.search(searchQuery.trim(), nextLimit);
      if (lastQueryRef.current === searchQuery.trim()) {
        const list = Array.isArray(res) ? res : [];
        setSearchResults(list);
        setSearchLimit(nextLimit);
        setHasMore(list.length >= nextLimit && nextLimit < 45);
      }
    } catch (e) {
      console.error('Failed to load more results:', e);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!value.trim() || value.trim().length < 2) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      setIsSearching(false);
      return;
    }

    // Debounce for 550ms so fast typing doesn't trigger intermediate single-word queries
    searchTimeoutRef.current = setTimeout(() => {
      executeSearch(value, 15);
    }, 550);
  };

  const handleImmediateSearch = () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    executeSearch(searchQuery, 15);
  };

  const selectSearchResult = async (result: SearchResult) => {
    setShowSearchDropdown(false);
    setUrlInput(result.url);
    setIsDownloadingUrl(true);
    try {
      const res = await api.downloadFromUrl(result.url);
      onAddToQueue([
        {
          id: `${Date.now()}`,
          name: result.title || res.filename,
          path: res.path,
        },
      ]);
      setUrlInput('');
      setSearchQuery('');
      onNotify('success', 'Download Complete', result.title);
    } catch (e: any) {
      onNotify('error', 'Download Failed', e.message || 'Could not fetch YouTube video');
    } finally {
      setIsDownloadingUrl(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Immersive Studio Drag & Drop Deck */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'relative p-10 sm:p-14 rounded-3xl border-2 border-dashed transition-all duration-300 cursor-pointer text-center group flex flex-col items-center justify-center overflow-hidden',
          isDragOver
            ? 'border-indigo-400 bg-indigo-500/15 scale-[1.01] shadow-[0_0_50px_rgba(99,102,241,0.25)]'
            : 'border-white/10 hover:border-white/20 glass-panel hover:bg-slate-900/60 shadow-2xl'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="audio/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {/* Clean Static Upload Icon */}
        <div
          className={cn(
            'w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-105 shadow-xl',
            accentColor === 'indigo' &&
              'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 shadow-indigo-500/10',
            accentColor === 'emerald' &&
              'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-emerald-500/10',
            accentColor === 'rose' &&
              'bg-rose-500/15 text-rose-400 border border-rose-500/30 shadow-rose-500/10',
            accentColor === 'amber' &&
              'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-amber-500/10',
            accentColor === 'violet' &&
              'bg-violet-500/15 text-violet-400 border border-violet-500/30 shadow-violet-500/10'
          )}
        >
          <UploadCloud className="w-8 h-8" />
        </div>

        <h4 className="text-lg sm:text-xl font-black text-white font-outfit mb-2 tracking-tight">
          {t('Drop your audio files here')}
        </h4>
        <p className="text-xs text-slate-400 max-w-md leading-relaxed">
          {t('Supported: WAV, MP3, FLAC, OGG | Multiple files supported')}
        </p>
      </div>

      {/* Online Stream Links & YouTube Search Deck */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Paste Link */}
        <div className="glass-panel p-2 rounded-2xl flex items-center gap-2 border border-white/10 shadow-lg">
          <div className="p-2 rounded-xl bg-white/[0.05] text-slate-400">
            <LinkIcon className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUrlDownload()}
            placeholder={t('Paste link (YouTube, SoundCloud...)')}
            className="w-full bg-transparent text-xs sm:text-sm text-white placeholder-slate-500 outline-none px-1"
          />
          <button
            onClick={handleUrlDownload}
            disabled={isDownloadingUrl || !urlInput.trim()}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-bold text-white transition-all duration-200 shrink-0 flex items-center gap-1.5 active:scale-95 shadow-md"
          >
            {isDownloadingUrl ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{t('Downloading...')}</span>
              </>
            ) : (
              <span>{t('Download')}</span>
            )}
          </button>
        </div>

        {/* YouTube Instant Search */}
        <div className="relative" ref={dropdownRef}>
          <div className="glass-panel p-2 rounded-2xl flex items-center gap-2 border border-white/10 shadow-lg">
            <div className="p-2 rounded-xl bg-red-500/10 text-red-400">
              <Youtube className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleImmediateSearch()}
              placeholder={t('Search YouTube...')}
              className="w-full bg-transparent text-xs sm:text-sm text-white placeholder-slate-500 outline-none px-1"
            />
            {isSearching ? (
              <Loader2 className="w-4 h-4 text-indigo-400 animate-spin mr-2 shrink-0" />
            ) : (
              <button
                type="button"
                onClick={handleImmediateSearch}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors mr-1 shrink-0"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Search Dropdown with Infinite Scrolling */}
          {showSearchDropdown && searchResults.length > 0 && (
            <div
              onScroll={(e) => {
                const el = e.currentTarget;
                if (el.scrollHeight - el.scrollTop - el.clientHeight < 30) {
                  loadMoreResults();
                }
              }}
              className="absolute top-full left-0 right-0 mt-2 bg-slate-900/95 border border-white/15 backdrop-blur-2xl rounded-3xl shadow-2xl p-2 z-50 max-h-72 overflow-y-auto space-y-1 custom-scrollbar"
            >
              {searchResults.map((res, i) => (
                <div
                  key={i}
                  onClick={() => selectSearchResult(res)}
                  className="p-3 rounded-2xl hover:bg-white/[0.08] cursor-pointer flex items-center gap-3 transition-colors text-left group"
                >
                  <div className="p-2 rounded-xl bg-red-500/10 text-red-400 group-hover:scale-110 transition-transform shrink-0">
                    <Youtube className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-slate-200 truncate flex-1 group-hover:text-white">
                    {res.title}
                  </span>
                  {res.duration && (
                    <span className="text-[10px] text-slate-400 font-mono bg-black/40 px-2 py-0.5 rounded-md shrink-0">
                      {typeof res.duration === 'number'
                        ? formatTime(res.duration)
                        : res.duration}
                    </span>
                  )}
                </div>
              ))}

              {/* Loading More Indicator at Bottom */}
              {isLoadingMore && (
                <div className="p-3 text-center flex items-center justify-center gap-2 text-indigo-400 text-xs font-semibold">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Daha fazla sonuç yükleniyor...</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Audio Queue List */}
      {queue.length > 0 && (
        <div className="glass-panel rounded-3xl p-6 space-y-4 border border-white/10 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <FileAudio className="w-4 h-4 text-indigo-400" />
              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Processing Queue ({queue.length})
              </h5>
            </div>
            <button
              onClick={onClearQueue}
              className="text-xs text-rose-400 hover:text-rose-300 transition-colors font-medium"
            >
              Clear All
            </button>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
            {queue.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/70 border border-white/5 text-xs hover:border-white/10 transition-all"
              >
                <div className="flex items-center gap-3 truncate">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                  <span className="font-bold text-white truncate">{item.name}</span>
                  {item.size && (
                    <span className="text-[10px] text-slate-500 font-mono">
                      {formatBytes(item.size)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => onRemoveFromQueue(item.id)}
                  className="p-1.5 rounded-xl hover:bg-white/10 text-slate-500 hover:text-rose-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* AI Separation Trigger Button */}
          <button
            onClick={onStartSeparation}
            disabled={isProcessing || queue.length === 0}
            className={cn(
              'w-full py-4 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-3 transition-all duration-300 shadow-2xl active:scale-[0.98] disabled:opacity-50 relative overflow-hidden group',
              accentColor === 'indigo' &&
                'bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-700 shadow-indigo-500/30',
              accentColor === 'emerald' &&
                'bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-700 shadow-emerald-500/30',
              accentColor === 'rose' &&
                'bg-gradient-to-r from-rose-600 via-rose-500 to-rose-700 shadow-rose-500/30',
              accentColor === 'amber' &&
                'bg-gradient-to-r from-amber-600 via-amber-500 to-amber-700 shadow-amber-500/30',
              accentColor === 'violet' &&
                'bg-gradient-to-r from-violet-600 via-violet-500 to-violet-700 shadow-violet-500/30'
            )}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{t('Separating Audio Tracks')}...</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-white transition-transform group-hover:scale-110" />
                <span className="tracking-wide">
                  {queue.length > 1 ? t('Run Batch Separation') : t('Run AI Separation')}
                </span>
                <Sparkles className="w-4 h-4 opacity-70 animate-pulse" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
