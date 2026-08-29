'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Video,
  X,
  Download,
  Loader2,
  Sparkles,
  Smartphone,
  Monitor,
  CheckCircle2,
  Play,
  Pause,
  Plus,
  Trash2,
  Mic2,
  Music,
  Palette,
  Edit3,
  Database,
  RotateCcw,
  FastForward,
  Repeat,
  Radio,
  Undo2,
  ArrowRight,
  FolderUp,
  FolderDown,
  ChevronDown,
  FileCode,
} from 'lucide-react';
import { Language, LyricSegment } from '@/lib/types';
import { getTranslation } from '@/lib/translations';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface KaraokeStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  instStem: string;
  vocalStem?: string;
  lang: Language;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
}

export const KaraokeStudioModal: React.FC<KaraokeStudioModalProps> = ({
  isOpen,
  onClose,
  instStem,
  vocalStem,
  lang,
  onNotify,
}) => {
  const t = (key: string) => getTranslation(lang, key);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [segments, setSegments] = useState<LyricSegment[]>([]);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // SQLite Persistence State
  const [isSavingDb, setIsSavingDb] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Import / Export State
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  // Close export dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Video Customization
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [theme, setTheme] = useState<'gold' | 'neon' | 'cyberpunk' | 'emerald'>('gold');
  const [title, setTitle] = useState(instStem.replace(/\.[^/.]+$/, '').replace(/_(Instrumental|other).*/i, ''));
  const [artist, setArtist] = useState('Karaoke Track');
  const [activeTab, setActiveTab] = useState<'lyrics' | 'video'>('lyrics');

  // Precision Audio Player State
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeAudioSource, setActiveAudioSource] = useState<'vocal' | 'inst'>(vocalStem ? 'vocal' : 'inst');
  const [loopLineIndex, setLoopLineIndex] = useState<number | null>(null);
  const [activePlayingIndex, setActivePlayingIndex] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  // Smule Spacebar Live Synchronization State
  const [isLiveSyncMode, setIsLiveSyncMode] = useState(false);
  const [liveSyncIndex, setLiveSyncIndex] = useState<number>(0);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [spacePressStartTime, setSpacePressStartTime] = useState<number | null>(null);
  const rowRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  // Stop audio on close
  useEffect(() => {
    if (!isOpen && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      setActivePlayingIndex(null);
      setIsLiveSyncMode(false);
    }
  }, [isOpen]);

  // Audio Engine Lifecycle
  useEffect(() => {
    if (!isOpen) return;
    const audioFile = activeAudioSource === 'vocal' && vocalStem ? vocalStem : instStem;
    if (!audioFile) return;

    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;
    const wasPlaying = isPlaying;
    const savedPos = audio.currentTime || 0;

    audio.src = `/output/${encodeURIComponent(audioFile)}`;
    audio.load();

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      if (savedPos > 0 && savedPos < audio.duration) {
        audio.currentTime = savedPos;
      }
      if (wasPlaying) {
        audio.play().catch(() => {});
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);

      // Handle Line Loop Mode
      if (loopLineIndex !== null && segments[loopLineIndex]) {
        const targetSeg = segments[loopLineIndex];
        if (audio.currentTime >= targetSeg.end) {
          audio.currentTime = targetSeg.start;
        }
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setActivePlayingIndex(null);
      setIsSpacePressed(false);
    };

    const handlePlayEvent = () => setIsPlaying(true);
    const handlePauseEvent = () => {
      setIsPlaying(false);
      setIsSpacePressed(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlayEvent);
    audio.addEventListener('pause', handlePauseEvent);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlayEvent);
      audio.removeEventListener('pause', handlePauseEvent);
    };
  }, [isOpen, activeAudioSource, vocalStem, instStem, loopLineIndex, segments]);

  // Load lyrics on open
  useEffect(() => {
    if (isOpen) {
      setVideoUrl(null);
      const sourceForLyrics = vocalStem || instStem;
      if (sourceForLyrics) {
        fetchInitialLyrics(sourceForLyrics, false);
      }
    }
  }, [isOpen, instStem, vocalStem]);

  // Smule Spacebar Sync Keyboard Listener
  useEffect(() => {
    if (!isOpen || activeTab !== 'lyrics') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isTypingInInput = activeTag === 'input' || activeTag === 'textarea';

      // SPACE KEY: Handle Live Sync or Play/Pause
      if (e.code === 'Space' && !e.repeat) {
        if (isTypingInInput) {
          return; // Allow normal space typing inside input
        }
        e.preventDefault();

        if (isLiveSyncMode) {
          // In Smule Live Sync Mode: Space down records Start Time
          if (!audioRef.current) return;
          if (audioRef.current.paused) {
            audioRef.current.play().catch(() => {});
          }

          const curT = Number(audioRef.current.currentTime.toFixed(2));
          setIsSpacePressed(true);
          setSpacePressStartTime(curT);

          if (segments[liveSyncIndex]) {
            setSegments((prev) => {
              const next = [...prev];
              if (next[liveSyncIndex]) {
                next[liveSyncIndex] = {
                  ...next[liveSyncIndex],
                  start: curT,
                };
              }
              return next;
            });
          }
        } else {
          // Normal mode: Space toggles Play/Pause
          toggleMasterPlay();
        }
      } else if (isLiveSyncMode && !isTypingInInput) {
        if (e.code === 'Backspace') {
          e.preventDefault();
          // Step back to previous line to re-time it
          handleLiveSyncPrev();
        } else if (e.code === 'ArrowRight' || e.code === 'Tab') {
          e.preventDefault();
          handleLiveSyncNext();
        } else if (e.code === 'Escape') {
          setIsLiveSyncMode(false);
          onNotify('info', 'Canlı Senkron Kapandı', 'Smule senkron modundan çıkıldı.');
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isTypingInInput = activeTag === 'input' || activeTag === 'textarea';

      if (e.code === 'Space' && isLiveSyncMode && !isTypingInInput) {
        e.preventDefault();
        if (!audioRef.current) return;

        const curT = Number(audioRef.current.currentTime.toFixed(2));
        setIsSpacePressed(false);

        if (segments[liveSyncIndex]) {
          setSegments((prev) => {
            const next = [...prev];
            if (next[liveSyncIndex]) {
              const startT = Number(next[liveSyncIndex].start) || 0;
              const endT = Math.max(Number((startT + 0.4).toFixed(2)), curT);
              next[liveSyncIndex] = {
                ...next[liveSyncIndex],
                end: endT,
              };
              triggerAutoSave(next);
            }
            return next;
          });

          // Auto-advance to next line
          const nextIdx = liveSyncIndex + 1;
          if (nextIdx < segments.length) {
            setLiveSyncIndex(nextIdx);
            rowRefs.current[nextIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            onNotify('success', 'Tüm Sözler Senkronlandı! 🎉', 'Şarkıdaki tüm satırların zamanlaması başarıyla kaydedildi.');
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isOpen, activeTab, isLiveSyncMode, liveSyncIndex, segments, isPlaying]);

  const handleLiveSyncPrev = () => {
    if (liveSyncIndex > 0) {
      const prevIdx = liveSyncIndex - 1;
      setLiveSyncIndex(prevIdx);
      if (segments[prevIdx] && audioRef.current) {
        // Rewind slightly before the previous line
        const jumpTime = Math.max(0, segments[prevIdx].start - 1.0);
        seekTo(jumpTime);
      }
      rowRefs.current[prevIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleLiveSyncNext = () => {
    if (liveSyncIndex < segments.length - 1) {
      const nextIdx = liveSyncIndex + 1;
      setLiveSyncIndex(nextIdx);
      rowRefs.current[nextIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const startLiveSyncMode = (targetIndex = 0) => {
    setIsLiveSyncMode(true);
    setLiveSyncIndex(targetIndex);
    setIsSpacePressed(false);

    if (segments[targetIndex] && audioRef.current) {
      const startAt = Math.max(0, segments[targetIndex].start - 0.5);
      seekTo(startAt);
      if (audioRef.current.paused) {
        audioRef.current.play().catch(() => {});
      }
    } else if (audioRef.current && audioRef.current.paused) {
      audioRef.current.play().catch(() => {});
    }

    rowRefs.current[targetIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    onNotify('info', 'Smule Canlı Senkron Modu Aktif 🎙️', 'Şarkı çalarken söz başladığında Space tuşuna basılı tutun, bittiğinde bırakın!');
  };

  const saveToDatabase = async (segmentsToSave: LyricSegment[], notifyUser = false) => {
    const sourceFile = vocalStem || instStem;
    if (!sourceFile || segmentsToSave.length === 0) return;
    setIsSavingDb(true);
    try {
      await api.saveLyrics(sourceFile, segmentsToSave, 'tr');
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastSavedTime(nowStr);
      if (notifyUser) {
        onNotify('success', 'Veritabanına Kaydedildi', `Şarkı sözleri SQLite veritabanına kalıcı olarak kaydedildi (${nowStr}).`);
      }
    } catch (err: any) {
      console.warn('SQLite Save Warning:', err?.message || err);
      if (notifyUser) {
        onNotify('warning', 'Kayıt Uyarısı', 'Sunucuya bağlanılamadı, sözler arayüzde korunuyor.');
      }
    } finally {
      setIsSavingDb(false);
    }
  };

  const triggerAutoSave = (newSegments: LyricSegment[], immediate = false) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (immediate) {
      saveToDatabase(newSegments, false);
    } else {
      saveTimeoutRef.current = setTimeout(() => {
        saveToDatabase(newSegments, false);
      }, 350);
    }
  };

  // Flush any pending auto-save immediately on modal close or unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        const sourceFile = vocalStem || instStem;
        if (sourceFile && segments.length > 0) {
          api.saveLyrics(sourceFile, segments, 'tr').catch(() => {});
        }
      }
    };
  }, [segments, vocalStem, instStem]);

  const fetchInitialLyrics = async (sourceFile: string, force = false) => {
    setLoadingLyrics(true);
    try {
      const res = await api.transcribeLyrics(sourceFile, 'tr', force);
      if (res.segments && res.segments.length > 0) {
        setSegments(res.segments);
        if (res.cached) {
          const savedAt = res.updated_at ? new Date(res.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Kayıtlı';
          setLastSavedTime(savedAt);
          onNotify('success', 'Veritabanından Yüklendi', `${res.segments.length} satır kayıtlı şarkı sözü SQLite veritabanından anında yüklendi.`);
        } else {
          setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
          onNotify('success', 'Sözler Çıkarıldı & Kaydedildi!', `${res.segments.length} satır şarkı sözü Whisper AI ile çıkarıldı ve SQLite veritabanına kaydedildi.`);
        }
      } else {
        setSegments([]);
      }
    } catch (err: any) {
      onNotify('warning', 'Söz Çıkarma Uyarısı', 'Whisper sözleri otomatik okuyamadı, manuel satır ekleyebilirsiniz.');
    } finally {
      setLoadingLyrics(false);
    }
  };

  const handleSegmentChange = (index: number, field: keyof LyricSegment, val: string | number) => {
    setSegments((prev) => {
      const next = [...prev];
      const updated = { ...next[index], [field]: val };
      if (field === 'text' || field === 'start' || field === 'end') {
        delete (updated as any).words;
      }
      next[index] = updated;
      triggerAutoSave(next, false);
      return next;
    });
  };

  const handleAddSegment = (index?: number) => {
    setSegments((prev) => {
      const next = [...prev];
      if (index !== undefined && next[index]) {
        // Row-level insert (insert right below current row)
        const prevEnd = Number(next[index].end) || 0;
        const nextStart = next[index + 1] ? Number(next[index + 1].start) : prevEnd + 3;
        const newSeg: LyricSegment = {
          start: Number(prevEnd.toFixed(2)),
          end: Number(Math.max(prevEnd + 0.5, nextStart).toFixed(2)),
          text: '',
        };
        next.splice(index + 1, 0, newSeg);
      } else {
        // Top Toolbar "Satır Ekle" Button: Add empty line at the very top (en üste boş satır)
        const firstStart = next.length > 0 ? Number(next[0].start) : 3.0;
        const newSeg: LyricSegment = {
          start: 0.0,
          end: Number(Math.max(0.5, firstStart).toFixed(2)),
          text: '',
        };
        next.unshift(newSeg);
      }
      triggerAutoSave(next, true);
      return next;
    });
  };

  const handleDeleteSegment = (index: number) => {
    setSegments((prev) => {
      const next = prev.filter((_, i) => i !== index);
      triggerAutoSave(next, true);
      return next;
    });
  };

  // Export Lyrics to JSON, LRC or SRT file
  const handleExport = (format: 'json' | 'lrc' | 'srt') => {
    if (segments.length === 0) {
      onNotify('warning', 'Dışa Aktarılacak Söz Yok', 'Lütfen önce en az bir satır söz ekleyin.');
      return;
    }

    const baseName = (instStem || vocalStem || 'karaoke_lyrics').replace(/\.[^/.]+$/, '').replace(/_(Instrumental|Vocals|other).*/i, '');
    let content = '';
    let mimeType = 'text/plain;charset=utf-8';
    const fileExt = format;

    if (format === 'json') {
      content = JSON.stringify(
        {
          title: title || 'Karaoke Track',
          artist: artist || 'UVR5',
          duration: duration,
          exported_at: new Date().toISOString(),
          segments: segments.map((s) => ({
            start: Number(s.start),
            end: Number(s.end),
            text: s.text.trim(),
          })),
        },
        null,
        2
      );
      mimeType = 'application/json;charset=utf-8';
    } else if (format === 'lrc') {
      const lines = [
        `[ti:${title || baseName}]`,
        `[ar:${artist || 'UVR5 Studio'}]`,
        `[length:${formatPrecisionTime(duration)}]`,
      ];
      segments.forEach((s) => {
        const startSec = Number(s.start) || 0;
        const mins = Math.floor(startSec / 60);
        const secs = (startSec % 60).toFixed(2).padStart(5, '0');
        lines.push(`[${mins.toString().padStart(2, '0')}:${secs}]${s.text.trim()}`);
      });
      content = lines.join('\n');
    } else if (format === 'srt') {
      const srtBlocks = segments.map((s, idx) => {
        const stSec = Number(s.start) || 0;
        const enSec = Number(s.end) || stSec + 2.0;

        const stH = Math.floor(stSec / 3600);
        const stM = Math.floor((stSec % 3600) / 60);
        const stS = Math.floor(stSec % 60);
        const stMs = Math.floor((stSec - Math.floor(stSec)) * 1000);

        const enH = Math.floor(enSec / 3600);
        const enM = Math.floor((enSec % 3600) / 60);
        const enS = Math.floor(enSec % 60);
        const enMs = Math.floor((enSec - Math.floor(enSec)) * 1000);

        const stStr = `${stH.toString().padStart(2, '0')}:${stM.toString().padStart(2, '0')}:${stS.toString().padStart(2, '0')},${stMs.toString().padStart(3, '0')}`;
        const enStr = `${enH.toString().padStart(2, '0')}:${enM.toString().padStart(2, '0')}:${enS.toString().padStart(2, '0')},${enMs.toString().padStart(3, '0')}`;

        return `${idx + 1}\n${stStr} --> ${enStr}\n${s.text.trim()}\n`;
      });
      content = srtBlocks.join('\n');
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}_lyrics.${fileExt}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    onNotify('success', 'Dışa Aktarıldı (Export) 📤', `${segments.length} satır söz ve süre ${format.toUpperCase()} formatında indirildi.`);
    setShowExportMenu(false);
  };

  // Import Lyrics from JSON, LRC or SRT file
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const fileName = file.name.toLowerCase();
      let importedSegments: LyricSegment[] = [];

      if (fileName.endsWith('.json')) {
        const parsed = JSON.parse(text);
        const list = Array.isArray(parsed) ? parsed : (parsed.segments || parsed.lyrics || []);
        importedSegments = list.map((item: any) => ({
          start: Number(item.start) || 0,
          end: Number(item.end) || (Number(item.start) || 0) + 2.5,
          text: String(item.text || item.line || '').trim(),
        })).filter((s: LyricSegment) => s.text.length > 0);
      } else if (fileName.endsWith('.lrc')) {
        const lines = text.split(/\r?\n/);
        const lrcEntries: { start: number; text: string }[] = [];
        const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

        lines.forEach((line) => {
          const matches = [...line.matchAll(timeRegex)];
          const cleanText = line.replace(timeRegex, '').trim();
          if (cleanText) {
            matches.forEach((m) => {
              const mins = parseInt(m[1], 10) || 0;
              const secs = parseInt(m[2], 10) || 0;
              const frac = m[3] ? parseFloat(`0.${m[3]}`) : 0;
              const totalSec = mins * 60 + secs + frac;
              lrcEntries.push({ start: Number(totalSec.toFixed(2)), text: cleanText });
            });
          }
        });

        lrcEntries.sort((a, b) => a.start - b.start);
        importedSegments = lrcEntries.map((entry, idx) => {
          const nextStart = lrcEntries[idx + 1] ? lrcEntries[idx + 1].start : entry.start + 3.0;
          return {
            start: entry.start,
            end: Number(Math.max(entry.start + 0.5, nextStart - 0.2).toFixed(2)),
            text: entry.text,
          };
        });
      } else if (fileName.endsWith('.srt')) {
        const blocks = text.split(/\r?\n\r?\n/);
        blocks.forEach((block) => {
          const lines = block.trim().split(/\r?\n/);
          if (lines.length >= 2) {
            const timeLine = lines.find((l) => l.includes('-->'));
            if (timeLine) {
              const [stStr, enStr] = timeLine.split('-->').map((s) => s.trim());
              const parseSrtTime = (tStr: string) => {
                const parts = tStr.replace(',', '.').split(':');
                if (parts.length === 3) {
                  return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
                }
                return 0;
              };
              const start = Number(parseSrtTime(stStr).toFixed(2));
              const end = Number(parseSrtTime(enStr).toFixed(2));
              const textLines = lines.slice(lines.indexOf(timeLine) + 1).join(' ').trim();
              if (textLines) {
                importedSegments.push({ start, end, text: textLines });
              }
            }
          }
        });
      } else {
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
        if (lines.length > 0) {
          const totalDur = duration > 0 ? duration : lines.length * 4.0;
          const step = totalDur / lines.length;
          importedSegments = lines.map((l, idx) => ({
            start: Number((idx * step).toFixed(2)),
            end: Number(((idx + 1) * step - 0.3).toFixed(2)),
            text: l,
          }));
        }
      }

      if (importedSegments.length > 0) {
        setSegments(importedSegments);
        triggerAutoSave(importedSegments, true);
        onNotify('success', 'İçe Aktarıldı & Kaydedildi (Import) 📥', `${importedSegments.length} satır söz ve süreler yüklendi ve SQLite veritabanına kalıcı olarak kaydedildi.`);
      } else {
        onNotify('warning', 'Dosya Boş', 'Dosyada geçerli şarkı sözü satırı bulunamadı.');
      }
    } catch (err: any) {
      onNotify('error', 'İçe Aktarma Hatası', err.message || 'Dosya okunamadı.');
    } finally {
      if (importFileInputRef.current) importFileInputRef.current.value = '';
    }
  };

  // Playback Controls
  const toggleMasterPlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
  };

  const stepCurrentTime = (delta: number) => {
    if (!audioRef.current) return;
    const newT = Math.max(0, Math.min(duration, audioRef.current.currentTime + delta));
    audioRef.current.currentTime = newT;
    setCurrentTime(newT);
  };

  const seekTo = (targetSec: number) => {
    if (!audioRef.current) return;
    const clamped = Math.max(0, Math.min(duration || 9999, targetSec));
    audioRef.current.currentTime = clamped;
    setCurrentTime(clamped);
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, clickX / rect.width));
    seekTo(fraction * duration);
  };

  const handleTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const moveX = e.clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, moveX / rect.width));
    setHoverTime(fraction * duration);
  };

  const playLine = (index: number) => {
    if (!audioRef.current || !segments[index]) return;
    const seg = segments[index];

    if (activePlayingIndex === index && isPlaying) {
      audioRef.current.pause();
      setActivePlayingIndex(null);
      return;
    }

    audioRef.current.currentTime = seg.start;
    audioRef.current.play().catch(() => {});
    setActivePlayingIndex(index);
  };

  const stepSegmentTime = (index: number, field: 'start' | 'end', delta: number) => {
    setSegments((prev) => {
      const next = [...prev];
      const currentVal = Number(next[index][field]) || 0;
      const newVal = Math.max(0, Number((currentVal + delta).toFixed(2)));
      next[index] = { ...next[index], [field]: newVal };
      triggerAutoSave(next, true);
      return next;
    });
  };

  const setPlayheadToSegment = (index: number, field: 'start' | 'end') => {
    const cur = Number(currentTime.toFixed(2));
    setSegments((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: cur };
      triggerAutoSave(next, true);
      return next;
    });
    onNotify('info', 'Zaman Ayarlandı', `${field === 'start' ? 'Başlangıç' : 'Bitiş'} zamanı ${formatPrecisionTime(cur)} olarak güncellendi.`);
  };

  const toggleLoopLine = (index: number) => {
    if (loopLineIndex === index) {
      setLoopLineIndex(null);
    } else {
      setLoopLineIndex(index);
      if (segments[index]) {
        seekTo(segments[index].start);
        if (audioRef.current && !isPlaying) {
          audioRef.current.play().catch(() => {});
        }
      }
    }
  };

  const formatPrecisionTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00.00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds - Math.floor(seconds)) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const handleGenerateVideo = async () => {
    if (segments.length === 0) {
      onNotify('warning', 'Söz Eksik', 'Lütfen en az bir şarkı sözü satırı ekleyin.');
      return;
    }

    if (audioRef.current) audioRef.current.pause();
    setRendering(true);
    setVideoUrl(null);
    try {
      // Ensure all current edited segments are flushed and saved to SQLite database
      await saveToDatabase(segments, false);

      const res = await api.generateKaraokeVideo({
        inst_file: instStem,
        segments: segments,
        title: title,
        artist: artist,
        aspect_ratio: aspectRatio,
        theme: theme,
      });

      if (res.download_url) {
        setVideoUrl(res.download_url);
        setActiveTab('video');
        onNotify('success', '🎬 1080p Karaoke Videosu Hazır!', 'Videonuz başarıyla oluşturuldu.');
      }
    } catch (err: any) {
      onNotify('error', 'Render Başarısız', err.message || 'Karaoke videosu oluşturulamadı');
    } finally {
      setRendering(false);
    }
  };

  if (!isOpen || !mounted) return null;

  const currentSyncSegment = segments[liveSyncIndex];

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-2xl animate-fade-in">
      <div className="relative w-full max-w-4xl bg-slate-900/95 border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-500/30 shadow-lg shadow-amber-500/10">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black font-outfit text-white tracking-tight">
                  YouTube Karaoke Stüdyosu & Video Oluşturucu
                </h3>
                <span className="text-[9px] font-bold font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                  1080P HD
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate max-w-md">
                Enstrümantal: <span className="text-slate-200 font-bold">{instStem}</span>
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (audioRef.current) audioRef.current.pause();
              onClose();
            }}
            className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Studio Tabs Navigation & Top Actions */}
        <div className="px-6 py-2.5 border-b border-white/5 bg-slate-950/40 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('lyrics')}
              className={cn(
                'px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2',
                activeTab === 'lyrics'
                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 shadow-md'
                  : 'text-slate-400 hover:text-white bg-white/5'
              )}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>1. Sözleri Düzenle & Senkronla ({segments.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('video')}
              className={cn(
                'px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2',
                activeTab === 'video'
                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 shadow-md'
                  : 'text-slate-400 hover:text-white bg-white/5'
              )}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>2. Video Tasarımı & Render</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Smule Spacebar Live Sync Toggle Button */}
            <button
              onClick={() => isLiveSyncMode ? setIsLiveSyncMode(false) : startLiveSyncMode(liveSyncIndex)}
              className={cn(
                'px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md active:scale-95 border',
                isLiveSyncMode
                  ? 'bg-gradient-to-r from-pink-500/30 to-purple-500/30 border-pink-500/60 text-pink-200 animate-pulse'
                  : 'bg-white/5 hover:bg-pink-500/10 text-pink-300 border-pink-500/30'
              )}
              title="Smule gibi şarkı çalarken Space tuşuna basılı tutarak sözleri canlı senkronlayın"
            >
              <Radio className={cn('w-3.5 h-3.5', isLiveSyncMode ? 'text-pink-400 animate-spin' : 'text-pink-400')} />
              <span>{isLiveSyncMode ? 'Canlı Space Aktif' : '🎙️ Smule Space Senkron'}</span>
            </button>

            {isSavingDb ? (
              <span className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                <span>SQLite'a Kaydediliyor...</span>
              </span>
            ) : (
              <button
                onClick={() => saveToDatabase(segments, true)}
                title="Şarkı sözlerini SQLite veritabanına kalıcı olarak kaydet"
                className="px-2.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
              >
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                <span>SQLite Kayıtlı {lastSavedTime ? `(${lastSavedTime})` : ''}</span>
              </button>
            )}

            <button
              onClick={() => fetchInitialLyrics(vocalStem || instStem, true)}
              disabled={loadingLyrics}
              title="Whisper AI ile şarkı sözlerini sıfırdan baştan analiz et"
              className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
            >
              {loadingLyrics ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>AI ile Yeniden Çıkar</span>
            </button>

            {/* Hidden File Input for Importing Lyrics */}
            <input
              ref={importFileInputRef}
              type="file"
              accept=".json,.lrc,.srt,.txt"
              className="hidden"
              onChange={handleImportFile}
            />

            {/* Import Lyrics Button */}
            <button
              onClick={() => importFileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
              title="JSON, LRC veya SRT formatındaki söz ve süreleri içe aktar"
            >
              <FolderUp className="w-3.5 h-3.5 text-teal-400" />
              <span>İçe Aktar</span>
            </button>

            {/* Export Lyrics Dropdown Menu */}
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
                title="Şarkı sözlerini ve milisaniye sürelerini JSON, LRC veya SRT olarak dışa aktar / yedekle"
              >
                <FolderDown className="w-3.5 h-3.5 text-cyan-400" />
                <span>Dışa Aktar</span>
                <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
              </button>

              {showExportMenu && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-slate-900/95 border border-white/15 backdrop-blur-2xl rounded-2xl shadow-2xl p-1.5 z-[100] space-y-1 animate-fade-in text-left">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Format Seçin (Export)
                  </div>
                  <button
                    onClick={() => handleExport('json')}
                    className="w-full px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 flex items-center justify-between transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-400 font-mono text-[10px] font-bold">JSON</span>
                      <span>JSON Formatı</span>
                    </div>
                    <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded">Önerilen</span>
                  </button>
                  <button
                    onClick={() => handleExport('lrc')}
                    className="w-full px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 flex items-center justify-between transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded-md bg-pink-500/20 text-pink-400 font-mono text-[10px] font-bold">LRC</span>
                      <span>LRC Karaoke</span>
                    </div>
                  </button>
                  <button
                    onClick={() => handleExport('srt')}
                    className="w-full px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 flex items-center justify-between transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold">SRT</span>
                      <span>SRT Altyazı</span>
                    </div>
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => handleAddSegment()}
              className="px-3 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
              title="En başa yeni boş satır ekle"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Satır Ekle</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Interactive Lyric Editor with Pro Studio Timeline Scrubber */}
        {activeTab === 'lyrics' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4 max-h-[60vh]">
            {/* Master Precision Audio Player & Timeline Progress Bar */}
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-white/10 space-y-3 shadow-inner">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                {/* Left: Master Play / Rewind / Fast-Forward */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => stepCurrentTime(-2)}
                    className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition-all active:scale-95 text-xs font-bold flex items-center gap-1 border border-white/5"
                    title="2 Saniye Geri Sar"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>-2s</span>
                  </button>

                  <button
                    onClick={toggleMasterPlay}
                    className={cn(
                      "px-4 py-2 rounded-xl font-black text-xs flex items-center gap-2 shadow-lg transition-all active:scale-95",
                      isPlaying
                        ? "bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20"
                        : "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-amber-500/20"
                    )}
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-4 h-4 fill-current" />
                        <span>Durdur</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                        <span>Oynat</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => stepCurrentTime(2)}
                    className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition-all active:scale-95 text-xs font-bold flex items-center gap-1 border border-white/5"
                    title="2 Saniye İleri Sar"
                  >
                    <FastForward className="w-3.5 h-3.5" />
                    <span>+2s</span>
                  </button>
                </div>

                {/* Center: Audio Source Selection (Vocal vs Instrumental) */}
                <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-white/5">
                  <span className="text-[10px] font-bold text-slate-500 px-2 uppercase font-mono">Ses:</span>
                  {vocalStem && (
                    <button
                      onClick={() => setActiveAudioSource('vocal')}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all",
                        activeAudioSource === 'vocal'
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm"
                          : "text-slate-400 hover:text-white"
                      )}
                      title="Söz senkronu yaparken sadece insan sesini net duyun"
                    >
                      <Mic2 className="w-3 h-3" />
                      <span>Vokal (İnsan Sesi)</span>
                    </button>
                  )}
                  <button
                    onClick={() => setActiveAudioSource('inst')}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all",
                      activeAudioSource === 'inst'
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-sm"
                        : "text-slate-400 hover:text-white"
                    )}
                    title="Müziğin ritmini ve enstrümantal halini dinleyin"
                  >
                    <Music className="w-3 h-3" />
                    <span>Enstrümantal</span>
                  </button>
                </div>

                {/* Right: Real-time Millisecond Clock */}
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="text-amber-400 font-black text-sm bg-slate-900 px-3 py-1 rounded-lg border border-amber-500/20 shadow-inner">
                    ⏱️ {formatPrecisionTime(currentTime)}
                  </span>
                  <span className="text-slate-500">/</span>
                  <span className="text-slate-400">{formatPrecisionTime(duration)}</span>
                </div>
              </div>

              {/* Interactive Scrubbable Timeline Track */}
              <div
                ref={progressBarRef}
                onClick={handleTimelineClick}
                onMouseMove={handleTimelineMouseMove}
                onMouseLeave={() => setHoverTime(null)}
                className="relative w-full h-8 bg-slate-900/90 hover:bg-slate-900 rounded-xl border border-white/10 cursor-pointer overflow-hidden group select-none flex items-center shadow-inner"
              >
                {/* Active Segment Region Highlight Block on Timeline */}
                {activePlayingIndex !== null && segments[activePlayingIndex] && duration > 0 && (
                  <div
                    className="absolute top-0 bottom-0 bg-amber-500/30 border-x-2 border-amber-400 pointer-events-none z-10"
                    style={{
                      left: `${(segments[activePlayingIndex].start / duration) * 100}%`,
                      width: `${((segments[activePlayingIndex].end - segments[activePlayingIndex].start) / duration) * 100}%`
                    }}
                  />
                )}

                {/* Overall Song Playback Progress Fill */}
                <div
                  className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-amber-500/30 via-amber-500/50 to-amber-400/80 pointer-events-none transition-all duration-75"
                  style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                />

                {/* Playhead Needle Line */}
                <div
                  className="absolute top-0 bottom-0 w-1 bg-amber-300 shadow-[0_0_12px_#f59e0b] pointer-events-none z-20"
                  style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                />

                {/* Hover Preview Marker & Tooltip */}
                {hoverTime !== null && duration > 0 && (
                  <>
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-white/70 pointer-events-none z-30"
                      style={{ left: `${(hoverTime / duration) * 100}%` }}
                    />
                    <div
                      className="absolute -top-7 px-2 py-0.5 bg-slate-800 text-amber-300 text-[10px] font-mono font-bold rounded shadow border border-white/20 pointer-events-none z-40 transform -translate-x-1/2"
                      style={{ left: `${(hoverTime / duration) * 100}%` }}
                    >
                      {formatPrecisionTime(hoverTime)}
                    </div>
                  </>
                )}

                {/* Time Markers */}
                <div className="absolute inset-0 px-3 flex items-center justify-between text-[9px] font-mono text-slate-500 pointer-events-none z-0">
                  <span>0:00</span>
                  <span>{formatPrecisionTime(duration * 0.25)}</span>
                  <span>{formatPrecisionTime(duration * 0.5)}</span>
                  <span>{formatPrecisionTime(duration * 0.75)}</span>
                  <span>{formatPrecisionTime(duration)}</span>
                </div>
              </div>
            </div>

            {/* Smule Live Spacebar HUD Banner */}
            {isLiveSyncMode && (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-pink-950/80 via-purple-950/80 to-slate-950/80 border border-pink-500/40 shadow-xl shadow-pink-500/10 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-pink-500"></span>
                    </span>
                    <h4 className="text-xs font-black text-pink-300 tracking-wide uppercase font-mono">
                      Smule Canlı Space Senkronizasyonu
                    </h4>
                    <span className="text-[10px] font-bold text-pink-400/80 bg-pink-500/10 px-2 py-0.5 rounded-md border border-pink-500/20">
                      Satır #{liveSyncIndex + 1} / {segments.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleLiveSyncPrev}
                      disabled={liveSyncIndex === 0}
                      className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold flex items-center gap-1 disabled:opacity-30 transition-all"
                      title="Önceki satıra dön ve tekrar kaydet (Backspace)"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>Geri Al (Backspace)</span>
                    </button>

                    <button
                      onClick={handleLiveSyncNext}
                      disabled={liveSyncIndex >= segments.length - 1}
                      className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold flex items-center gap-1 disabled:opacity-30 transition-all"
                      title="Bu satırı atla ve sonrakine geç (Tab / Sağ Ok)"
                    >
                      <span>Atla</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => setIsLiveSyncMode(false)}
                      className="px-2.5 py-1 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold transition-all border border-rose-500/30"
                    >
                      Kapat (Esc)
                    </button>
                  </div>
                </div>

                {/* Real-time Instructions & Active Line Preview */}
                <div className={cn(
                  "p-3 rounded-xl border transition-all flex items-center justify-between gap-4",
                  isSpacePressed
                    ? "bg-emerald-500/20 border-emerald-500/60 shadow-lg shadow-emerald-500/20"
                    : "bg-black/40 border-pink-500/30"
                )}>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center font-mono font-black text-xs shrink-0 shadow-md",
                      isSpacePressed
                        ? "bg-emerald-400 text-slate-950 animate-pulse"
                        : "bg-pink-500/20 text-pink-300 border border-pink-500/40"
                    )}>
                      {isSpacePressed ? '🔴' : 'SPACE'}
                    </div>
                    <div>
                      <div className="text-[11px] font-bold text-slate-400">
                        {isSpacePressed
                          ? 'SÖZ KAYDEDİLİYOR (Başlangıç: ' + formatPrecisionTime(spacePressStartTime || currentTime) + ') -> BİTTİĞİNDE SPACE TUŞUNU BIRAKIN!'
                          : 'ŞARKI ÇALARKEN SÖZ BAŞLADIĞINDA SPACE TUŞUNA BASILI TUTUN:'}
                      </div>
                      <div className="text-sm font-black text-white mt-0.5">
                        "{currentSyncSegment ? currentSyncSegment.text : 'Söz Kalmadı'}"
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 text-right font-mono text-xs">
                    {isSpacePressed ? (
                      <span className="text-emerald-300 font-black text-sm animate-pulse">
                        Kaydediliyor... ⏺️
                      </span>
                    ) : (
                      <span className="text-pink-300 font-bold">
                        Basılmayı Bekliyor ⏳
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* List of Lyric Rows */}
            {loadingLyrics ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
                <p className="text-sm font-bold">Whisper AI vokalden şarkı sözlerini çıkarıyor...</p>
              </div>
            ) : segments.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400 text-center">
                <Mic2 className="w-10 h-10 stroke-1 text-amber-400" />
                <p className="text-sm font-semibold">Henüz şarkı sözü eklenmedi.</p>
                <button
                  onClick={() => handleAddSegment()}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>İlk Satırı Ekle</span>
                </button>
              </div>
            ) : (
              segments.map((seg, idx) => {
                const nextSeg = segments[idx + 1];
                const isSinging = currentTime >= seg.start && currentTime <= seg.end;
                const isLingering = currentTime > seg.end && (nextSeg ? currentTime < nextSeg.start : currentTime <= seg.end + 2.5);
                const isRowActive = isSinging || isLingering;
                const rowDuration = Math.max(0.1, seg.end - seg.start);
                const rowProgressPercent = isSinging
                  ? Math.min(100, Math.max(0, ((currentTime - seg.start) / rowDuration) * 100))
                  : isLingering
                  ? 100
                  : 0;
                const isLoopingThis = loopLineIndex === idx;
                const isLiveTarget = isLiveSyncMode && liveSyncIndex === idx;
                const hasSustain = (seg.end - seg.start) >= 2.5;

                return (
                  <React.Fragment key={idx}>
                    {/* Breath / Es Pause Indicator between lines */}
                    {idx > 0 && segments[idx - 1] && (seg.start - segments[idx - 1].end) >= 1.5 && (
                      <div className="flex items-center justify-center gap-2 py-1 my-0.5 select-none">
                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
                        <span className="text-[10px] font-mono font-bold text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-sm">
                          <span>💨 Nefes / Es Arası:</span>
                          <span className="text-emerald-300 font-black">{(seg.start - segments[idx - 1].end).toFixed(1)}s</span>
                          <span className="text-slate-400 text-[9px]">• Hazır Ol</span>
                        </span>
                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
                      </div>
                    )}

                    <div
                      ref={(el) => { rowRefs.current[idx] = el; }}
                    onClick={() => {
                      if (isLiveSyncMode) {
                        setLiveSyncIndex(idx);
                        if (audioRef.current) {
                          seekTo(Math.max(0, seg.start - 0.5));
                        }
                      }
                    }}
                    className={cn(
                      "relative p-3.5 rounded-2xl border transition-all group overflow-hidden cursor-pointer",
                      isLiveTarget
                        ? isSpacePressed
                          ? "bg-emerald-500/15 border-emerald-400 shadow-xl shadow-emerald-500/20 ring-2 ring-emerald-400/50"
                          : "bg-pink-500/10 border-pink-400 shadow-xl shadow-pink-500/20 ring-2 ring-pink-400/40"
                        : isSinging
                        ? "bg-amber-500/10 border-amber-500/60 shadow-lg shadow-amber-500/10"
                        : isLingering
                        ? "bg-slate-900/90 border-amber-500/30"
                        : activePlayingIndex === idx
                        ? "bg-slate-950/90 border-amber-500/40"
                        : "bg-slate-950/70 border-white/10 hover:border-amber-500/30"
                    )}
                  >
                    {/* Live Row Progress Fill Bar */}
                    {isRowActive && rowProgressPercent > 0 && (
                      <div
                        className={cn(
                          "absolute bottom-0 left-0 top-0 pointer-events-none transition-all duration-75",
                          isSinging
                            ? "bg-gradient-to-r from-amber-500/10 to-amber-500/20 border-r-2 border-amber-400"
                            : "bg-amber-500/10 opacity-70"
                        )}
                        style={{ width: `${rowProgressPercent}%` }}
                      />
                    )}

                    <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-3">
                      {/* Play Line Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playLine(idx);
                        }}
                        className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform active:scale-90 shadow-md',
                          activePlayingIndex === idx && isPlaying
                            ? 'bg-amber-500 text-slate-950 shadow-amber-500/30'
                            : 'bg-white/5 hover:bg-amber-500/20 hover:text-amber-300 text-slate-300'
                        )}
                        title="Bu satırı dinle ve senkronu test et"
                      >
                        {activePlayingIndex === idx && isPlaying ? (
                          <Pause className="w-4 h-4 fill-current" />
                        ) : (
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        )}
                      </button>

                      {/* Loop Line Toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLoopLine(idx);
                        }}
                        className={cn(
                          'p-2 rounded-xl text-xs font-bold shrink-0 transition-all active:scale-90',
                          isLoopingThis
                            ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                            : 'bg-white/5 hover:bg-white/10 text-slate-400'
                        )}
                        title={isLoopingThis ? 'Döngüyü Kapat' : 'Bu satırı sürekli tekrarla (İnce ayar için)'}
                      >
                        <Repeat className="w-3.5 h-3.5" />
                      </button>

                      {/* Precision Timing Inputs & Steppers */}
                      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {/* Start Timing Box */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[9px] font-mono text-slate-400 uppercase font-bold">Başlangıç</span>
                            <button
                              onClick={() => setPlayheadToSegment(idx, 'start')}
                              title="O an çalan süreyi bu satırın başlangıcı yap"
                              className="text-[9px] text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer"
                            >
                              ⏱️ Şu Anı Al
                            </button>
                          </div>
                          <div className="flex items-center gap-0.5 bg-slate-900 rounded-lg p-0.5 border border-white/10 focus-within:border-amber-500 shadow-inner">
                            <button
                              onClick={() => stepSegmentTime(idx, 'start', -0.1)}
                              title="100ms geriye al"
                              className="px-1.5 py-0.5 text-[10px] font-mono text-slate-400 hover:text-amber-400 hover:bg-white/5 rounded active:scale-95"
                            >
                              -0.1
                            </button>
                            <input
                              type="number"
                              step="0.05"
                              value={seg.start}
                              onChange={(e) => handleSegmentChange(idx, 'start', parseFloat(e.target.value) || 0)}
                              className="w-16 py-1 bg-transparent text-xs font-mono font-bold text-amber-300 text-center focus:outline-none"
                            />
                            <button
                              onClick={() => stepSegmentTime(idx, 'start', 0.1)}
                              title="100ms ileriye al"
                              className="px-1.5 py-0.5 text-[10px] font-mono text-slate-400 hover:text-amber-400 hover:bg-white/5 rounded active:scale-95"
                            >
                              +0.1
                            </button>
                          </div>
                        </div>

                        <span className="text-slate-600 self-end pb-2 font-bold">-</span>

                        {/* End Timing Box */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[9px] font-mono text-slate-400 uppercase font-bold">Bitiş</span>
                            <button
                              onClick={() => setPlayheadToSegment(idx, 'end')}
                              title="O an çalan süreyi bu satırın bitişi yap"
                              className="text-[9px] text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer"
                            >
                              ⏱️ Şu Anı Al
                            </button>
                          </div>
                          <div className="flex items-center gap-0.5 bg-slate-900 rounded-lg p-0.5 border border-white/10 focus-within:border-amber-500 shadow-inner">
                            <button
                              onClick={() => stepSegmentTime(idx, 'end', -0.1)}
                              title="100ms geriye al"
                              className="px-1.5 py-0.5 text-[10px] font-mono text-slate-400 hover:text-amber-400 hover:bg-white/5 rounded active:scale-95"
                            >
                              -0.1
                            </button>
                            <input
                              type="number"
                              step="0.05"
                              value={seg.end}
                              onChange={(e) => handleSegmentChange(idx, 'end', parseFloat(e.target.value) || 0)}
                              className="w-16 py-1 bg-transparent text-xs font-mono font-bold text-amber-300 text-center focus:outline-none"
                            />
                            <button
                              onClick={() => stepSegmentTime(idx, 'end', 0.1)}
                              title="100ms ileriye al"
                              className="px-1.5 py-0.5 text-[10px] font-mono text-slate-400 hover:text-amber-400 hover:bg-white/5 rounded active:scale-95"
                            >
                              +0.1
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Text Input & Sustain Indicator */}
                      <div className="flex-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={seg.text}
                          onChange={(e) => handleSegmentChange(idx, 'text', e.target.value)}
                          className={cn(
                            "w-full p-2.5 rounded-xl border text-xs font-semibold placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-all",
                            isLiveTarget
                              ? "bg-slate-900 border-pink-400 text-pink-200 font-bold"
                              : isSinging
                              ? "bg-slate-900/90 border-amber-500/50 text-amber-200"
                              : "bg-slate-900/90 border-white/10 text-white"
                          )}
                          placeholder="Şarkı sözü satırı..."
                        />
                        {hasSustain && (
                          <span
                            className="text-[10px] font-mono text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-1 rounded-lg font-bold shrink-0 flex items-center gap-1 shadow-sm"
                            title="Bu satırda uzun uzatma (sustain) var. Video renderında otomatik '......' eklenecektir."
                          >
                            <span>⏱️ {(seg.end - seg.start).toFixed(1)}s</span>
                            <span className="text-amber-300 font-black">...</span>
                          </span>
                        )}
                      </div>

                      {/* Row Actions */}
                      <div className="flex items-center gap-1 shrink-0 self-end sm:self-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleAddSegment(idx)}
                          className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                          title="Altına Yeni Satır Ekle"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteSegment(idx)}
                          className="p-2 rounded-xl bg-white/[0.03] hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors"
                          title="Satırı Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
              })
            )}
          </div>
        )}

        {/* Tab 2: Video Customization & Render */}
        {activeTab === 'video' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 max-h-[60vh]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Aspect Ratio Picker */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 space-y-3">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-amber-400" />
                  <span>Video Formatı / En Boy Oranı</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setAspectRatio('16:9')}
                    className={cn(
                      'p-3 rounded-xl border text-left transition-all flex items-center gap-3',
                      aspectRatio === '16:9'
                        ? 'bg-amber-500/20 border-amber-500/50 text-white'
                        : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
                    )}
                  >
                    <Monitor className="w-5 h-5 text-amber-400" />
                    <div>
                      <div className="text-xs font-black">16:9 (Yatay)</div>
                      <div className="text-[10px] text-slate-400">YouTube Standart</div>
                    </div>
                  </button>

                  <button
                    onClick={() => setAspectRatio('9:16')}
                    className={cn(
                      'p-3 rounded-xl border text-left transition-all flex items-center gap-3',
                      aspectRatio === '9:16'
                        ? 'bg-amber-500/20 border-amber-500/50 text-white'
                        : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
                    )}
                  >
                    <Smartphone className="w-5 h-5 text-amber-400" />
                    <div>
                      <div className="text-xs font-black">9:16 (Dikey)</div>
                      <div className="text-[10px] text-slate-400">Shorts / Reels / TikTok</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Theme Color Picker */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 space-y-3">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <Palette className="w-4 h-4 text-amber-400" />
                  <span>Görsel Tema & Renk Paleti</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'gold', name: 'Gold Studio', color: 'from-amber-500 to-amber-700' },
                    { id: 'neon', name: 'Neon Sky', color: 'from-cyan-500 to-blue-600' },
                    { id: 'cyberpunk', name: 'Cyberpunk', color: 'from-pink-500 to-purple-600' },
                    { id: 'emerald', name: 'Emerald Wave', color: 'from-emerald-500 to-teal-700' },
                  ].map((tItem) => (
                    <button
                      key={tItem.id}
                      onClick={() => setTheme(tItem.id as any)}
                      className={cn(
                        'p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5',
                        theme === tItem.id
                          ? 'bg-white/10 border-amber-500/50 text-white shadow-md'
                          : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
                      )}
                    >
                      <div className={cn('w-4 h-4 rounded-full bg-gradient-to-r shrink-0', tItem.color)} />
                      <span className="text-xs font-bold truncate">{tItem.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Video Metadata Inputs */}
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 space-y-3">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-2">
                <Music className="w-4 h-4 text-amber-400" />
                <span>Şarkı Bilgileri (Video Üst Başlığı İçin)</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] font-mono text-slate-500 uppercase block mb-1">Şarkı Adı</span>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs font-bold text-white focus:outline-none focus:border-amber-500"
                    placeholder="Şarkı Adı..."
                  />
                </div>
                <div>
                  <span className="text-[10px] font-mono text-slate-500 uppercase block mb-1">Sanatçı / Kanal</span>
                  <input
                    type="text"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs font-bold text-white focus:outline-none focus:border-amber-500"
                    placeholder="Sanatçı..."
                  />
                </div>
              </div>
            </div>

            {/* Video Preview Player (when rendered) */}
            {videoUrl && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-300">1080p Video Hazır!</span>
                  </div>
                  <a
                    href={videoUrl}
                    download={videoUrl.split('/').pop() || 'karaoke_video_1080p.mp4'}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Videoyu İndir (MP4)</span>
                  </a>
                </div>

                <div className="rounded-2xl overflow-hidden border border-white/10 bg-black aspect-video max-h-64 flex items-center justify-center">
                  <video src={videoUrl} controls className="w-full h-full object-contain" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="p-5 border-t border-white/10 bg-slate-950/60 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            <span className="font-bold text-amber-400">{segments.length}</span> satır söz hazır • 1080p HD Enstrümantal
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (audioRef.current) audioRef.current.pause();
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition-all"
            >
              Kapat
            </button>

            <button
              onClick={handleGenerateVideo}
              disabled={rendering || segments.length === 0}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all disabled:opacity-50"
            >
              {rendering ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>FFmpeg 1080p Render Ediliyor...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>1080p Karaoke Videosunu Oluştur</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
