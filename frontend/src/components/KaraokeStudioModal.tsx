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
  FileText,
  Mic2,
  Music,
  Palette,
  Edit3,
  Volume2,
} from 'lucide-react';
import { Language, LyricSegment } from '@/lib/types';
import { getTranslation } from '@/lib/translations';
import { api } from '@/lib/api';
import { cn, formatTime } from '@/lib/utils';

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

  // Video Customization
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [theme, setTheme] = useState<'gold' | 'neon' | 'cyberpunk' | 'emerald'>('gold');
  const [title, setTitle] = useState(instStem.replace(/\.[^/.]+$/, '').replace(/_(Instrumental|other).*/i, ''));
  const [artist, setArtist] = useState('Karaoke Track');
  const [activeTab, setActiveTab] = useState<'lyrics' | 'video'>('lyrics');

  // Mini Audio Player for Line Audition
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setVideoUrl(null);
      // Auto-transcribe using vocal stem if available, or instrumental
      const sourceForLyrics = vocalStem || instStem;
      if (sourceForLyrics && segments.length === 0) {
        fetchInitialLyrics(sourceForLyrics);
      }
    }
  }, [isOpen, instStem, vocalStem]);

  const fetchInitialLyrics = async (sourceFile: string) => {
    setLoadingLyrics(true);
    try {
      const res = await api.transcribeLyrics(sourceFile, 'tr');
      if (res.segments && res.segments.length > 0) {
        setSegments(res.segments);
      }
    } catch (err: any) {
      onNotify('warning', 'Söz Çıkarma Uyarısı', 'Whisper sözleri otomatik okuyamadı, manuel düzenleyebilirsiniz.');
    } finally {
      setLoadingLyrics(false);
    }
  };

  const handleSegmentChange = (index: number, field: keyof LyricSegment, val: string | number) => {
    setSegments((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
  };

  const handleAddSegment = (index?: number) => {
    setSegments((prev) => {
      const next = [...prev];
      const prevEnd = index !== undefined && next[index] ? next[index].end : 0;
      const newSeg: LyricSegment = {
        start: prevEnd,
        end: prevEnd + 4,
        text: 'Yeni Şarkı Sözü Satırı...',
      };
      if (index !== undefined) {
        next.splice(index + 1, 0, newSeg);
      } else {
        next.push(newSeg);
      }
      return next;
    });
  };

  const handleDeleteSegment = (index: number) => {
    setSegments((prev) => prev.filter((_, i) => i !== index));
  };

  const playLineAudio = (seg: LyricSegment, index: number) => {
    const audioFile = vocalStem || instStem;
    if (!audioFile) return;

    if (playingIndex === index && audioRef.current) {
      audioRef.current.pause();
      setPlayingIndex(null);
      return;
    }

    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;
    audio.src = `/output/${encodeURIComponent(audioFile)}`;
    audio.currentTime = seg.start;
    audio.play().catch(console.error);
    setPlayingIndex(index);

    const checkInterval = setInterval(() => {
      if (audio.currentTime >= seg.end || audio.paused) {
        audio.pause();
        clearInterval(checkInterval);
        setPlayingIndex(null);
      }
    }, 100);
  };

  const handleGenerateVideo = async () => {
    if (segments.length === 0) {
      onNotify('warning', 'Söz Eksik', 'Lütfen en az bir şarkı sözü satırı ekleyin.');
      return;
    }

    setRendering(true);
    setVideoUrl(null);
    try {
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

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-2xl animate-fade-in">
      <div className="relative w-full max-w-4xl bg-slate-900/95 border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
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

        {/* Studio Tabs Navigation */}
        <div className="px-6 py-2.5 border-b border-white/5 bg-slate-950/40 flex items-center justify-between">
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

          <button
            onClick={() => handleAddSegment()}
            className="px-3 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Satır Ekle</span>
          </button>
        </div>

        {/* Tab 1: Interactive Lyric Editor */}
        {activeTab === 'lyrics' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-3 max-h-[55vh]">
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
              segments.map((seg, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/10 flex flex-col sm:flex-row sm:items-center gap-3 hover:border-amber-500/30 transition-all group"
                >
                  {/* Play Slice Button */}
                  <button
                    onClick={() => playLineAudio(seg, idx)}
                    className={cn(
                      'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform active:scale-90',
                      playingIndex === idx
                        ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300'
                    )}
                    title="Bu satırı dinle"
                  >
                    {playingIndex === idx ? (
                      <Pause className="w-4 h-4 fill-current" />
                    ) : (
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    )}
                  </button>

                  {/* Timing Inputs */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-mono text-slate-500 uppercase block">Başlangıç</span>
                      <input
                        type="number"
                        step="0.1"
                        value={seg.start}
                        onChange={(e) => handleSegmentChange(idx, 'start', parseFloat(e.target.value) || 0)}
                        className="w-16 p-1.5 rounded-lg bg-slate-900 border border-white/10 text-xs font-mono font-bold text-amber-300 text-center focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <span className="text-slate-600 self-end pb-2 font-bold">-</span>
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-mono text-slate-500 uppercase block">Bitiş</span>
                      <input
                        type="number"
                        step="0.1"
                        value={seg.end}
                        onChange={(e) => handleSegmentChange(idx, 'end', parseFloat(e.target.value) || 0)}
                        className="w-16 p-1.5 rounded-lg bg-slate-900 border border-white/10 text-xs font-mono font-bold text-amber-300 text-center focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  {/* Text Input */}
                  <div className="flex-1">
                    <input
                      type="text"
                      value={seg.text}
                      onChange={(e) => handleSegmentChange(idx, 'text', e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-xs font-semibold text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      placeholder="Şarkı sözü satırı..."
                    />
                  </div>

                  {/* Row Actions */}
                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
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
              ))
            )}
          </div>
        )}

        {/* Tab 2: Video Customization & Render */}
        {activeTab === 'video' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-5 max-h-[55vh]">
            {/* Format Selection (16:9 YouTube vs 9:16 Shorts) */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-widest block">
                Video Formatı
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAspectRatio('16:9')}
                  className={cn(
                    'p-3.5 rounded-2xl border flex items-center gap-3 transition-all text-left group',
                    aspectRatio === '16:9'
                      ? 'bg-amber-500/20 border-amber-500/60 shadow-lg shadow-amber-500/10'
                      : 'bg-slate-950/60 border-white/5 hover:border-white/20'
                  )}
                >
                  <div
                    className={cn(
                      'p-2.5 rounded-xl transition-colors',
                      aspectRatio === '16:9' ? 'bg-amber-500 text-slate-950' : 'bg-white/5 text-slate-400'
                    )}
                  >
                    <Monitor className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">16:9 YouTube HD Video</span>
                    <span className="text-[10px] text-slate-400 block">1920x1080 Tam Ekran Karaoke</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setAspectRatio('9:16')}
                  className={cn(
                    'p-3.5 rounded-2xl border flex items-center gap-3 transition-all text-left group',
                    aspectRatio === '9:16'
                      ? 'bg-amber-500/20 border-amber-500/60 shadow-lg shadow-amber-500/10'
                      : 'bg-slate-950/60 border-white/5 hover:border-white/20'
                  )}
                >
                  <div
                    className={cn(
                      'p-2.5 rounded-xl transition-colors',
                      aspectRatio === '9:16' ? 'bg-amber-500 text-slate-950' : 'bg-white/5 text-slate-400'
                    )}
                  >
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">9:16 Dikey Video</span>
                    <span className="text-[10px] text-slate-400 block">TikTok / Shorts / Reels</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Visual Color Theme */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-widest block">
                Görsel Tema & Söz Vurgusu
              </label>
              <div className="grid grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={() => setTheme('gold')}
                  className={cn(
                    'p-3 rounded-2xl border text-center transition-all',
                    theme === 'gold'
                      ? 'bg-amber-500/20 border-amber-500 text-white shadow-md'
                      : 'bg-slate-950/60 border-white/5 text-slate-400 hover:text-white'
                  )}
                >
                  <div className="w-4 h-4 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 mx-auto mb-1.5" />
                  <span className="text-xs font-bold block">Gold Studio</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTheme('neon')}
                  className={cn(
                    'p-3 rounded-2xl border text-center transition-all',
                    theme === 'neon'
                      ? 'bg-indigo-500/20 border-indigo-500 text-white shadow-md'
                      : 'bg-slate-950/60 border-white/5 text-slate-400 hover:text-white'
                  )}
                >
                  <div className="w-4 h-4 rounded-full bg-gradient-to-r from-sky-400 to-indigo-500 mx-auto mb-1.5" />
                  <span className="text-xs font-bold block">Neon Sky</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTheme('cyberpunk')}
                  className={cn(
                    'p-3 rounded-2xl border text-center transition-all',
                    theme === 'cyberpunk'
                      ? 'bg-pink-500/20 border-pink-500 text-white shadow-md'
                      : 'bg-slate-950/60 border-white/5 text-slate-400 hover:text-white'
                  )}
                >
                  <div className="w-4 h-4 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 mx-auto mb-1.5" />
                  <span className="text-xs font-bold block">Cyberpunk</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTheme('emerald')}
                  className={cn(
                    'p-3 rounded-2xl border text-center transition-all',
                    theme === 'emerald'
                      ? 'bg-emerald-500/20 border-emerald-500 text-white shadow-md'
                      : 'bg-slate-950/60 border-white/5 text-slate-400 hover:text-white'
                  )}
                >
                  <div className="w-4 h-4 rounded-full bg-gradient-to-r from-emerald-400 to-teal-600 mx-auto mb-1.5" />
                  <span className="text-xs font-bold block">Emerald</span>
                </button>
              </div>
            </div>

            {/* Title & Artist */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">
                  Şarkı Başlığı
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-2xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  placeholder="Şarkı adı..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">
                  Sanatçı / Açıklama
                </label>
                <input
                  type="text"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-2xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  placeholder="Sanatçı adı..."
                />
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
                    download
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
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

        {/* Modal Footer Actions */}
        <div className="p-5 border-t border-white/10 bg-slate-950/60 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500">
            {segments.length} satır söz hazır • 1080p HD Enstrümantal
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                if (audioRef.current) audioRef.current.pause();
                onClose();
              }}
              className="px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/10 text-slate-300 font-bold text-xs transition-colors"
            >
              Kapat
            </button>

            <button
              type="button"
              onClick={handleGenerateVideo}
              disabled={rendering || segments.length === 0}
              className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-xl shadow-amber-500/25 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {rendering ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>1080p Karaoke Render Ediliyor...</span>
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
