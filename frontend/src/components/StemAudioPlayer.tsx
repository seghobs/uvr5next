'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Download,
  Sliders,
  RotateCcw,
  Sparkles,
  Music,
  Loader2,
} from 'lucide-react';
import { Language, AccentColor } from '@/lib/types';
import { cn, formatTime, getNoteName, chromaticNotes } from '@/lib/utils';
import { getTranslation } from '@/lib/translations';
import { api } from '@/lib/api';
import { LyricsModal } from './LyricsModal';
import { VisualizerExportModal } from './VisualizerExportModal';

interface StemAudioPlayerProps {
  stem: string;
  lang: Language;
  accentColor: AccentColor;
  onNewStemCreated?: (filename: string) => void;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
}

export const StemAudioPlayer: React.FC<StemAudioPlayerProps> = ({
  stem,
  lang,
  accentColor,
  onNewStemCreated,
  onNotify,
}) => {
  const t = (key: string) => getTranslation(lang, key);
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Pitch & Tempo State
  const [showPitchTempo, setShowPitchTempo] = useState(false);
  const [pitchShift, setPitchShift] = useState(0);
  const [tempoFactor, setTempoFactor] = useState(1.0);
  const [isModifying, setIsModifying] = useState(false);

  const updateLivePlayback = useCallback((pitch: number, tempo: number) => {
    if (!wsRef.current) return;
    const media = wsRef.current.getMediaElement();
    if (media) {
      if (pitch !== 0) {
        const pitchRatio = Math.pow(2, pitch / 12);
        const effectiveRate = Math.max(0.2, Math.min(4.0, tempo * pitchRatio));
        try {
          (media as any).preservesPitch = false;
        } catch {}
        try {
          media.playbackRate = effectiveRate;
        } catch {}
      } else {
        try {
          (media as any).preservesPitch = true;
        } catch {}
        try {
          media.playbackRate = Math.max(0.2, Math.min(4.0, tempo));
        } catch {}
      }
    } else {
      try {
        wsRef.current.setPlaybackRate(tempo, pitch === 0);
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const colorMap: Record<AccentColor, { progress: string; cursor: string }> = {
      indigo: { progress: '#6366f1', cursor: '#818cf8' },
      emerald: { progress: '#10b981', cursor: '#34d399' },
      rose: { progress: '#f43f5e', cursor: '#fb7185' },
      amber: { progress: '#f59e0b', cursor: '#fbbf24' },
      violet: { progress: '#8b5cf6', cursor: '#a78bfa' },
    };
    const themeColors = colorMap[accentColor] || colorMap.indigo;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#334155',
      progressColor: themeColors.progress,
      cursorColor: themeColors.cursor,
      barWidth: 2.5,
      barGap: 2,
      barRadius: 3,
      height: 56,
      url: `/output/${encodeURIComponent(stem)}`,
    });

    ws.on('ready', () => {
      setDuration(ws.getDuration());
      updateLivePlayback(pitchShift, tempoFactor);
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));

    ws.on('audioprocess', () => {
      setCurrentTime(ws.getCurrentTime());
    });

    ws.on('finish', () => {
      setIsPlaying(false);
    });

    ws.on('error', (e) => {
      console.warn('WaveSurfer error:', e);
    });

    wsRef.current = ws;

    return () => {
      try {
        ws.destroy();
      } catch (err) {}
    };
  }, [stem, accentColor]);

  // Update playback rate/pitch when state changes without destroying WaveSurfer
  useEffect(() => {
    updateLivePlayback(pitchShift, tempoFactor);
  }, [pitchShift, tempoFactor, updateLivePlayback]);

  const handleTogglePlay = () => {
    if (!wsRef.current) return;
    wsRef.current.playPause();
  };

  const handleToggleMute = () => {
    if (!wsRef.current) return;
    const newMuted = !isMuted;
    wsRef.current.setMuted(newMuted);
    setIsMuted(newMuted);
  };

  const handleVolumeChange = (val: number) => {
    if (!wsRef.current) return;
    setVolume(val);
    wsRef.current.setVolume(val);
    if (val > 0 && isMuted) {
      wsRef.current.setMuted(false);
      setIsMuted(false);
    }
  };

  const handlePitchChange = (newPitch: number) => {
    setPitchShift(newPitch);
    updateLivePlayback(newPitch, tempoFactor);
  };

  const handleTempoChange = (newTempo: number) => {
    setTempoFactor(newTempo);
    updateLivePlayback(pitchShift, newTempo);
  };

  const handleResetPitchTempo = () => {
    setPitchShift(0);
    setTempoFactor(1.0);
    updateLivePlayback(0, 1.0);
  };

  const handleExportStem = async () => {
    setIsModifying(true);
    try {
      const res = await api.modifyAudio({
        file_name: stem,
        pitch_semitones: pitchShift,
        tempo_factor: tempoFactor,
      });

      if (res.status === 'success') {
        onNotify('success', t('Process & Export New Stem'), res.filename);
        if (onNewStemCreated) onNewStemCreated(res.filename);
        setShowPitchTempo(false);
        handleResetPitchTempo();
      } else {
        onNotify('error', 'Export Failed', res.message || 'Error modifying audio');
      }
    } catch (e: any) {
      onNotify('error', 'Export Failed', e.message);
    } finally {
      setIsModifying(false);
    }
  };

  const isVocal = stem.toLowerCase().includes('vocal') || stem.toLowerCase().includes('vox');
  const isInst = stem.toLowerCase().includes('instrumental') || stem.toLowerCase().includes('inst') || stem.toLowerCase().includes('other');

  // New Feature States
  const [analysis, setAnalysis] = useState<{ bpm: number; key: string; camelot: string } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isQuickCleaning, setIsQuickCleaning] = useState(false);
  const [showLyricsModal, setShowLyricsModal] = useState(false);
  const [showVisualizerModal, setShowVisualizerModal] = useState(false);

  // Auto-analyze audio key and BPM on mount
  useEffect(() => {
    let isMounted = true;
    const fetchAnalysis = async () => {
      setIsAnalyzing(true);
      try {
        const data = await api.analyzeAudio(stem);
        if (isMounted && data.key) {
          setAnalysis({
            bpm: data.bpm,
            key: data.key,
            camelot: data.camelot,
          });
        }
      } catch (e) {
        // silent fail
      } finally {
        if (isMounted) setIsAnalyzing(false);
      }
    };
    fetchAnalysis();
    return () => {
      isMounted = false;
    };
  }, [stem]);

  const handleQuickClean = async (cleanType: 'dereverb' | 'debleed') => {
    setIsQuickCleaning(true);
    try {
      const res = await api.quickClean({
        file_name: stem,
        clean_type: cleanType,
      });
      if (res.task_id) {
        onNotify(
          'info',
          cleanType === 'dereverb' ? '💧 De-Reverb Başlatıldı' : '✂️ De-Bleed Başlatıldı',
          'Arka planda 2. aşama stüdyo temizliği yapılıyor...'
        );
      }
    } catch (e: any) {
      onNotify('error', 'Temizlik Başarısız', e.message);
    } finally {
      setIsQuickCleaning(false);
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl backdrop-blur-xl space-y-4">
      {/* Top Stem Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 truncate">
          <div
            className={cn(
              'p-2.5 rounded-2xl border flex items-center justify-center shrink-0',
              isVocal && 'bg-rose-500/10 text-rose-400 border-rose-500/20',
              isInst && 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
              !isVocal && !isInst && 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
            )}
          >
            <Music className="w-5 h-5" />
          </div>
          <div className="truncate">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-sm text-white truncate">{stem}</h4>
              {analysis && (
                <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                  <span>🎼 {analysis.key} ({analysis.camelot})</span>
                  <span>•</span>
                  <span>⚡ {analysis.bpm} BPM</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                {isVocal ? t('Vocals') : isInst ? t('Instrumental') : t('Other Stem')}
              </span>
              {analysis && (
                <span className="md:hidden text-[10px] font-mono text-amber-400 font-bold">
                  {analysis.key} • {analysis.bpm} BPM
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Quick 2-Pass Clean Button */}
          {isVocal && (
            <button
              onClick={() => handleQuickClean('dereverb')}
              disabled={isQuickCleaning}
              className="px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
              title="Vokal arkasındaki tüm oda yankısını siler"
            >
              {isQuickCleaning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>💧</span>}
              <span className="hidden sm:inline">Yankıyı Sil</span>
            </button>
          )}

          {isInst && (
            <button
              onClick={() => handleQuickClean('debleed')}
              disabled={isQuickCleaning}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
              title="Enstrümantaldeki tüm artık vokal fısıltılarını kazır"
            >
              {isQuickCleaning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>✂️</span>}
              <span className="hidden sm:inline">Kalıntıyı Kazı</span>
            </button>
          )}

          {/* AI Karaoke Lyrics Button */}
          {isVocal && (
            <button
              onClick={() => setShowLyricsModal(true)}
              className="px-3 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95"
              title="Şarkı Sözlerini (.LRC/.SRT) Çıkar & Oynat"
            >
              <span>🎤</span>
              <span className="hidden sm:inline">Sözler</span>
            </button>
          )}

          {/* 1080p Video Visualizer Export */}
          <button
            onClick={() => setShowVisualizerModal(true)}
            className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95"
            title="1080p Dalga Formlu Video (TikTok/Reels/YouTube) Oluştur"
          >
            <span>🎬</span>
            <span className="hidden sm:inline">Video Klip</span>
          </button>

          {/* Pitch & Tempo Toggle */}
          <button
            onClick={() => setShowPitchTempo(!showPitchTempo)}
            className={cn(
              'px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95',
              showPitchTempo || pitchShift !== 0 || tempoFactor !== 1.0
                ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            )}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('Pitch & Tempo Editor')}</span>
          </button>

          {/* Download Output File */}
          <a
            href={`/output/${encodeURIComponent(stem)}`}
            download={stem}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-all active:scale-95"
            title={t('Download')}
          >
            <Download className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Waveform Player */}
      <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-3">
        <div ref={containerRef} className="w-full cursor-pointer" />

        {/* Player Controls */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3">
            {/* Play/Pause Button */}
            <button
              onClick={handleTogglePlay}
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg transition-transform active:scale-90',
                accentColor === 'indigo' && 'bg-indigo-600 hover:bg-indigo-500',
                accentColor === 'emerald' && 'bg-emerald-600 hover:bg-emerald-500',
                accentColor === 'rose' && 'bg-rose-600 hover:bg-rose-500',
                accentColor === 'amber' && 'bg-amber-600 hover:bg-amber-500',
                accentColor === 'violet' && 'bg-violet-600 hover:bg-violet-500'
              )}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
            </button>

            {/* Time Indicator */}
            <div className="text-xs font-mono text-slate-400">
              <span className="text-white font-bold">{formatTime(currentTime)}</span> /{' '}
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleMute}
              className="text-slate-400 hover:text-white transition-colors"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-20 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Pitch & Tempo Interactive Panel */}
      {showPitchTempo && (
        <div className="p-6 rounded-2xl bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20 space-y-6">
          {/* Header & Reset Button */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-400" />
              <h5 className="text-sm font-bold text-white font-outfit">
                {t('Pitch & Tempo Editor')}
              </h5>
            </div>
            {(pitchShift !== 0 || tempoFactor !== 1.0) && (
              <button
                onClick={handleResetPitchTempo}
                className="text-xs text-violet-300 hover:text-white px-2.5 py-1 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 transition-all font-mono font-medium flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t('Reset')}</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Pitch / Musical Note Slider */}
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <label className="text-xs font-bold text-violet-400 uppercase tracking-widest">
                  {t('Pitch (Semitones)')}
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-xl font-mono font-bold text-white">
                    {pitchShift > 0 ? `+${pitchShift}` : pitchShift}
                  </span>
                  <span className="text-xs font-mono font-bold text-violet-300 px-2 py-0.5 rounded bg-violet-500/20 border border-violet-500/30">
                    {getNoteName(pitchShift, lang)}
                  </span>
                </div>
              </div>

              <input
                type="range"
                min="-12"
                max="12"
                step="1"
                value={pitchShift}
                onChange={(e) => handlePitchChange(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
              />

              <div className="flex justify-between text-[10px] text-slate-500 font-bold uppercase">
                <span>-12 (Do↓)</span>
                <span>0 (Do)</span>
                <span>+12 (Do↑)</span>
              </div>

              {/* 12-TET Chromatic Note Buttons */}
              <div className="pt-2">
                <div className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <span>🎵</span>
                    <span>{t('Quick Note Selection')}</span>
                  </span>
                  <span className="text-[9px] text-violet-400 font-mono">12-TET Scale</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {chromaticNotes.map((n) => {
                    const isSelected = pitchShift === n.semitones;
                    return (
                      <button
                        key={n.semitones}
                        type="button"
                        onClick={() => handlePitchChange(n.semitones)}
                        className={cn(
                          'px-2 py-0.5 text-[10px] rounded border transition-all active:scale-95 font-mono',
                          isSelected
                            ? 'bg-violet-600 text-white font-bold border-violet-400 shadow-md shadow-violet-500/40 ring-1 ring-violet-400'
                            : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-700/60 hover:text-white'
                        )}
                      >
                        {lang === 'en' ? n.labelEN : n.labelTR}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Tempo (Speed) Controls */}
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <label className="text-xs font-bold text-fuchsia-400 uppercase tracking-widest">
                  {t('Tempo (Speed)')}
                </label>
                <span className="text-xl font-mono font-bold text-white">{tempoFactor}x</span>
              </div>

              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.05"
                value={tempoFactor}
                onChange={(e) => handleTempoChange(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-fuchsia-500"
              />

              <div className="flex justify-between text-[10px] text-slate-500 font-bold uppercase">
                <span>0.5x</span>
                <span>1.0x</span>
                <span>2.0x</span>
              </div>

              {/* Quick Tempo Buttons */}
              <div className="pt-2">
                <div className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <span>⚡</span>
                    <span>BPM / Speed</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {[0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 2.0].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => handleTempoChange(spd)}
                      className={cn(
                        'px-2 py-0.5 text-[10px] rounded border transition-all active:scale-95 font-mono',
                        tempoFactor === spd
                          ? 'bg-fuchsia-600 text-white font-bold border-fuchsia-400 shadow-md shadow-fuchsia-500/40 ring-1 ring-fuchsia-400'
                          : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-700/60 hover:text-white'
                      )}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Process & Export Button */}
          <button
            onClick={handleExportStem}
            disabled={isModifying}
            className="w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xl shadow-violet-500/20 active:scale-95 disabled:opacity-50"
          >
            {isModifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('Processing Audio...')}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>{t('Process & Export New Stem')}</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Synchronized Live Lyrics Modal */}
      <LyricsModal
        isOpen={showLyricsModal}
        onClose={() => setShowLyricsModal(false)}
        fileName={stem}
        currentTime={currentTime}
        isPlaying={isPlaying}
        onTogglePlay={handleTogglePlay}
        onSeek={(time) => {
          if (wsRef.current) {
            const dur = wsRef.current.getDuration();
            if (dur > 0) {
              wsRef.current.seekTo(time / dur);
            }
          }
        }}
        lang={lang}
        onNotify={onNotify}
      />

      {/* 1080p Video Visualizer Export Modal */}
      <VisualizerExportModal
        isOpen={showVisualizerModal}
        onClose={() => setShowVisualizerModal(false)}
        fileName={stem}
        lang={lang}
        onNotify={onNotify}
      />
    </div>
  );
};
