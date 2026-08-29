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
  Download,
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
  const [inputVal, setInputVal] = useState('');
  const [isDownloadingUrl, setIsDownloadingUrl] = useState(false);
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

  const isUrl = (text: string) => {
    const trimmed = text.trim();
    return /^(https?:\/\/|www\.|youtube\.com|youtu\.be|soundcloud\.com|spotify\.com)/i.test(trimmed);
  };

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

  const handleUrlDownload = async (targetUrl?: string) => {
    const urlToDownload = (targetUrl || inputVal).trim();
    if (!urlToDownload) return;
    setIsDownloadingUrl(true);
    setShowSearchDropdown(false);
    try {
      const res = await api.downloadFromUrl(urlToDownload);
      onAddToQueue([
        {
          id: `${Date.now()}`,
          name: res.title || res.filename,
          path: res.path,
        },
      ]);
      setInputVal('');
      setSearchResults([]);
      onNotify('success', 'Download Complete', res.title || res.filename);
    } catch (e: any) {
      onNotify('error', 'Download Failed', e.message || 'Could not fetch audio from URL');
    } finally {
      setIsDownloadingUrl(false);
    }
  };

  const executeSearch = async (queryText: string, limit = 15) => {
    const trimmed = queryText.trim();
    if (!trimmed || trimmed.length < 2 || isUrl(trimmed)) {
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
    if (isLoadingMore || !hasMore || isSearching || !inputVal.trim() || isUrl(inputVal)) return;
    const nextLimit = Math.min(45, searchLimit + 12);
    if (nextLimit === searchLimit) {
      setHasMore(false);
      return;
    }

    setIsLoadingMore(true);
    try {
      const res = await api.search(inputVal.trim(), nextLimit);
      if (lastQueryRef.current === inputVal.trim()) {
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

  const handleInputChange = (value: string) => {
    setInputVal(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    const trimmed = value.trim();
    if (isUrl(trimmed)) {
      setShowSearchDropdown(false);
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    if (!trimmed || trimmed.length < 2) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      setIsSearching(false);
      return;
    }

    // Debounce for 450ms
    searchTimeoutRef.current = setTimeout(() => {
      executeSearch(trimmed, 15);
    }, 450);
  };

  const handleImmediateSearch = () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    const trimmed = inputVal.trim();
    if (isUrl(trimmed)) {
      handleUrlDownload(trimmed);
    } else {
      executeSearch(trimmed, 15);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const trimmed = inputVal.trim();
      if (!trimmed) return;
      if (isUrl(trimmed)) {
        handleUrlDownload(trimmed);
      } else {
        handleImmediateSearch();
      }
    } else if (e.key === 'Escape') {
      setShowSearchDropdown(false);
    }
  };

  const handleClearInput = () => {
    setInputVal('');
    setSearchResults([]);
    setShowSearchDropdown(false);
    setIsSearching(false);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
  };

  const selectSearchResult = async (result: SearchResult) => {
    setShowSearchDropdown(false);
    setInputVal(result.title);
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
      setInputVal('');
      setSearchResults([]);
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

      {/* Unified Full-Width Online Stream Search & URL Bar */}
      <div className="relative w-full" ref={dropdownRef}>
        <div className="glass-panel p-2 sm:p-2.5 rounded-2xl flex items-center gap-2.5 sm:gap-3 border border-white/10 shadow-xl focus-within:border-indigo-500/50 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
          <div className={cn(
            "p-2.5 rounded-xl transition-colors shrink-0 flex items-center justify-center",
            isUrl(inputVal)
              ? "bg-indigo-500/15 text-indigo-400"
              : "bg-red-500/15 text-red-400"
          )}>
            {isUrl(inputVal) ? <LinkIcon className="w-4 h-4" /> : <Youtube className="w-4 h-4" />}
          </div>

          <input
            type="text"
            value={inputVal}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (searchResults.length > 0 && !isUrl(inputVal)) {
                setShowSearchDropdown(true);
              }
            }}
            placeholder={t('Search or paste audio/video link (YouTube, SoundCloud...)')}
            className="w-full bg-transparent text-xs sm:text-sm text-white placeholder-slate-500 outline-none px-1 font-medium"
          />

          {/* Clear Input Button */}
          {inputVal && !isDownloadingUrl && (
            <button
              type="button"
              onClick={handleClearInput}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors shrink-0"
              title="Temizle"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Action Button */}
          {isUrl(inputVal) ? (
            <button
              onClick={() => handleUrlDownload()}
              disabled={isDownloadingUrl || !inputVal.trim()}
              className="px-4 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-50 text-xs font-bold text-white transition-all duration-200 shrink-0 flex items-center gap-1.5 active:scale-95 shadow-lg shadow-indigo-500/20"
            >
              {isDownloadingUrl ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('Downloading...')}</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('Download')}</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleImmediateSearch}
              disabled={isSearching || isDownloadingUrl || !inputVal.trim()}
              className="px-3.5 sm:px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-50 text-xs font-bold text-slate-300 hover:text-white transition-all shrink-0 flex items-center gap-2 border border-white/5 active:scale-95"
            >
              {isSearching ? (
                <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">Ara</span>
            </button>
          )}
        </div>

        {/* Full-Width Search Dropdown Modal */}
        {showSearchDropdown && searchResults.length > 0 && !isUrl(inputVal) && (
          <div
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollHeight - el.scrollTop - el.clientHeight < 30) {
                loadMoreResults();
              }
            }}
            className="absolute top-full left-0 right-0 mt-2 bg-slate-900/95 border border-white/15 backdrop-blur-2xl rounded-3xl shadow-2xl p-2.5 z-50 max-h-80 overflow-y-auto space-y-1.5 custom-scrollbar animate-fade-in"
          >
            {searchResults.map((res, i) => (
              <div
                key={i}
                onClick={() => selectSearchResult(res)}
                className="p-3 rounded-2xl hover:bg-white/[0.08] cursor-pointer flex items-center justify-between gap-4 transition-all text-left group border border-transparent hover:border-white/10"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  {res.thumbnail ? (
                    <div className="relative w-14 h-9 sm:w-16 sm:h-10 rounded-xl overflow-hidden bg-slate-800 shrink-0 border border-white/10 group-hover:border-indigo-500/50 shadow-md">
                      <img
                        src={res.thumbnail}
                        alt={res.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fb = e.currentTarget.parentElement?.querySelector('.yt-fallback') as HTMLElement;
                          if (fb) fb.style.display = 'flex';
                        }}
                      />
                      <div className="yt-fallback hidden absolute inset-0 items-center justify-center bg-red-500/10 text-red-400">
                        <Youtube className="w-4 h-4" />
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-red-500/10 text-red-400 group-hover:scale-110 group-hover:bg-red-500/20 transition-all shrink-0">
                      <Youtube className="w-4 h-4" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-200 truncate group-hover:text-white">
                      {res.title}
                    </div>
                    {res.channel && (
                      <div className="text-[10px] text-slate-400 truncate mt-0.5 font-medium">
                        {res.channel}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  {res.duration && (
                    <span className="text-[10px] text-slate-400 font-mono bg-black/50 border border-white/5 px-2.5 py-1 rounded-lg">
                      {typeof res.duration === 'number' ? formatTime(res.duration) : res.duration}
                    </span>
                  )}
                  <span className="text-[11px] font-bold text-indigo-400 bg-indigo-500/10 group-hover:bg-indigo-500/20 border border-indigo-500/20 px-3 py-1 rounded-xl opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1">
                    <Download className="w-3 h-3" />
                    <span>İndir</span>
                  </span>
                </div>
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
