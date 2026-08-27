import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Language } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export interface ChromaticNote {
  semitones: number;
  labelTR: string;
  labelEN: string;
}

export const chromaticNotes: ChromaticNote[] = [
  { semitones: -12, labelTR: 'Do↓ (-12)', labelEN: 'C↓ (-12)' },
  { semitones: -7, labelTR: 'Fa↓ (-7)', labelEN: 'F↓ (-7)' },
  { semitones: -5, labelTR: 'Sol↓ (-5)', labelEN: 'G↓ (-5)' },
  { semitones: -3, labelTR: 'La↓ (-3)', labelEN: 'A↓ (-3)' },
  { semitones: -2, labelTR: 'La#↓ (-2)', labelEN: 'A#↓ (-2)' },
  { semitones: -1, labelTR: 'Si (-1)', labelEN: 'B (-1)' },
  { semitones: 0, labelTR: 'Do (0)', labelEN: 'C (0)' },
  { semitones: 1, labelTR: 'Do# (+1)', labelEN: 'C# (+1)' },
  { semitones: 2, labelTR: 'Re (+2)', labelEN: 'D (+2)' },
  { semitones: 3, labelTR: 'Re# (+3)', labelEN: 'D# (+3)' },
  { semitones: 4, labelTR: 'Mi (+4)', labelEN: 'E (+4)' },
  { semitones: 5, labelTR: 'Fa (+5)', labelEN: 'F (+5)' },
  { semitones: 6, labelTR: 'Fa# (+6)', labelEN: 'F# (+6)' },
  { semitones: 7, labelTR: 'Sol (+7)', labelEN: 'G (+7)' },
  { semitones: 8, labelTR: 'Sol# (+8)', labelEN: 'G# (+8)' },
  { semitones: 9, labelTR: 'La (+9)', labelEN: 'A (+9)' },
  { semitones: 10, labelTR: 'La# (+10)', labelEN: 'A# (+10)' },
  { semitones: 11, labelTR: 'Si (+11)', labelEN: 'B (+11)' },
  { semitones: 12, labelTR: 'Do↑ (+12)', labelEN: 'C↑ (+12)' },
];

export function getNoteName(shift: number, lang: Language): string {
  const s = parseInt(shift as any, 10) || 0;
  const mapTR: Record<string, string> = {
    '-12': 'Do↓ (-1 Oktav)',
    '-11': 'Do#↓ / Re♭',
    '-10': 'Re↓',
    '-9': 'Re#↓ / Mi♭',
    '-8': 'Mi↓',
    '-7': "Fa↓ (5'li)",
    '-6': 'Fa#↓ (Triton)',
    '-5': "Sol↓ (4'lü)",
    '-4': 'Sol#↓',
    '-3': 'La↓ (Minör 3)',
    '-2': 'La#↓ (-1 Ton)',
    '-1': 'Si (-½ Ton)',
    '0': 'Do (Doğal)',
    '1': 'Do# (+½ Ton)',
    '2': 'Re (+1 Ton)',
    '3': 'Re# (Minör 3)',
    '4': 'Mi (Majör 3)',
    '5': "Fa (4'lü)",
    '6': 'Fa# (Triton)',
    '7': "Sol (5'li)",
    '8': 'Sol#',
    '9': "La (Majör 6)",
    '10': "La# (Minör 7)",
    '11': "Si (Majör 7)",
    '12': 'Do↑ (+1 Oktav)',
  };
  const mapEN: Record<string, string> = {
    '-12': 'C↓ (-1 Oct)',
    '-11': 'C#↓ / D♭',
    '-10': 'D↓',
    '-9': 'D#↓ / E♭',
    '-8': 'E↓',
    '-7': 'F↓ (5th dn)',
    '-6': 'F#↓ (Tritone)',
    '-5': 'G↓ (4th dn)',
    '-4': 'G#↓',
    '-3': 'A↓ (Min 3rd)',
    '-2': 'A#↓ (-1 Step)',
    '-1': 'B (-½ Step)',
    '0': 'C (Root)',
    '1': 'C# (+½ Step)',
    '2': 'D (+1 Step)',
    '3': 'D# (Min 3rd)',
    '4': 'E (Maj 3rd)',
    '5': 'F (4th)',
    '6': 'F# (Tritone)',
    '7': 'G (5th)',
    '8': 'G#',
    '9': 'A (Maj 6th)',
    '10': 'A# (Min 7th)',
    '11': 'B (Maj 7th)',
    '12': 'C↑ (+1 Oct)',
  };
  const map = lang === 'en' ? mapEN : mapTR;
  return map[s.toString()] || `${s > 0 ? '+' : ''}${s} st`;
}
