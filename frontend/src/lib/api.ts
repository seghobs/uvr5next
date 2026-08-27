import { AvailableModels, ModelStatus, SeparationParams, TaskStatus, SearchResult, EnsembleSlot } from './types';

export const api = {
  async getModels(): Promise<AvailableModels> {
    const res = await fetch('/models');
    if (!res.ok) throw new Error('Failed to fetch models');
    return res.json();
  },

  async getModelStatus(modelKey: string): Promise<ModelStatus> {
    const res = await fetch(`/model_status/${encodeURIComponent(modelKey)}`);
    if (!res.ok) throw new Error('Failed to fetch model status');
    return res.json();
  },

  async downloadModel(modelKey: string): Promise<{ task_id: string }> {
    const res = await fetch('/download_model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_key: modelKey }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || err.message || 'Failed to start model download');
    }
    return res.json();
  },

  async getFavorites(): Promise<string[]> {
    try {
      const res = await fetch('/api/favorites');
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.favorites) ? data.favorites : [];
    } catch {
      return [];
    }
  },

  async toggleFavorite(modelName: string): Promise<{ status: string; favorites: string[] }> {
    const res = await fetch('/api/favorites/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_name: modelName }),
    });
    if (!res.ok) throw new Error('Failed to toggle favorite');
    return res.json();
  },

  async uploadAudio(file: File): Promise<{ filename: string; path: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/upload', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || err.message || 'Upload failed');
    }
    const data = await res.json();
    return {
      filename: data.filename || file.name,
      path: data.path || data.file_path || '',
    };
  },

  async downloadFromUrl(url: string): Promise<{ filename: string; path: string; title: string }> {
    const res = await fetch('/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || err.message || 'Download failed');
    }
    const data = await res.json();
    return {
      filename: data.filename || 'downloaded_audio',
      path: data.path || data.file_path || '',
      title: data.title || data.filename || 'Downloaded Audio',
    };
  },

  async search(query: string, maxResults: number = 20): Promise<SearchResult[]> {
    const res = await fetch(`/search?q=${encodeURIComponent(query)}&max_results=${maxResults}`);
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();
    return Array.isArray(data) ? data : (data.results || []);
  },

  async startSeparation(payload: {
    model_type: string;
    model_key: string;
    audio_path: string;
    out_format: string;
    params: SeparationParams;
  }): Promise<{ task_id: string }> {
    const res = await fetch('/separate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || err.message || 'Separation request failed');
    }
    return res.json();
  },

  async startEnsemble(payload: {
    models: EnsembleSlot[];
    audio_path: string;
    out_format: string;
    params: SeparationParams;
  }): Promise<{ task_id: string }> {
    const res = await fetch('/ensemble', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || err.message || 'Ensemble request failed');
    }
    return res.json();
  },

  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const res = await fetch(`/status/${encodeURIComponent(taskId)}`);
    if (!res.ok) throw new Error('Task status fetch failed');
    return res.json();
  },

  async modifyAudio(payload: {
    file_name: string;
    pitch_semitones: number;
    tempo_factor: number;
  }): Promise<{ status: string; filename: string; message?: string }> {
    const res = await fetch('/modify_audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Modify audio failed');
    return res.json();
  },

  async remixAudio(payload: {
    vocal_file: string;
    inst_file: string;
    vocal_gain: number;
    inst_gain: number;
    pitch_shift: number;
    tempo_factor: number;
    out_format: string;
  }): Promise<{ filename: string; message: string }> {
    const res = await fetch('/remix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Remix request failed');
    return res.json();
  },

  async getLeaderboard(filter: string): Promise<{ html: string }> {
    const res = await fetch(`/leaderboard?filter=${encodeURIComponent(filter)}`);
    if (!res.ok) throw new Error('Leaderboard fetch failed');
    return res.json();
  },

  async startBatch(payload: {
    input_dir: string;
    output_dir?: string;
    model_type: string;
    model_key: string;
    out_format: string;
    params?: SeparationParams;
  }): Promise<{ task_id: string }> {
    const res = await fetch('/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || err.message || 'Batch separation request failed');
    }
    return res.json();
  },

  async analyzeAudio(fileName: string): Promise<{
    bpm: number;
    key: string;
    root_note: string;
    scale: string;
    camelot: string;
    duration?: number;
  }> {
    const res = await fetch('/analyze_audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_name: fileName }),
    });
    if (!res.ok) throw new Error('Audio analysis failed');
    return res.json();
  },

  async transcribeLyrics(fileName: string, language: string = 'tr'): Promise<{
    status: string;
    segments: Array<{ start: number; end: number; text: string }>;
    lrc_content: string;
    srt_content: string;
    lrc_file: string;
    srt_file: string;
  }> {
    const res = await fetch('/transcribe_lyrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_name: fileName, language }),
    });
    if (!res.ok) throw new Error('Lyrics transcription failed');
    return res.json();
  },

  async quickClean(payload: {
    file_name: string;
    clean_type: 'dereverb' | 'debleed';
    out_format?: string;
  }): Promise<{ task_id: string }> {
    const res = await fetch('/quick_clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Quick clean request failed');
    return res.json();
  },

  async generateVisualizer(payload: {
    file_name: string;
    aspect_ratio?: '9:16' | '16:9';
    theme?: 'neon' | 'gold' | 'cyberpunk';
    title?: string;
  }): Promise<{ status: string; video_file: string; download_url: string }> {
    const res = await fetch('/generate_visualizer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Visualizer generation failed');
    return res.json();
  },
};
