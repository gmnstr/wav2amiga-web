/**
 * PAL period table for Amiga notes
 * Based on standard PAL Amiga periods
 */
export const PAL_PERIODS: Record<string, number> = {
  "C-1": 856, "C#1": 808, "D-1": 762, "D#1": 720, "E-1": 678, "F-1": 640, "F#1": 604, "G-1": 570,
  "G#1": 538, "A-1": 508, "A#1": 480, "B-1": 452,
  "C-2": 428, "C#2": 404, "D-2": 381, "D#2": 360, "E-2": 339, "F-2": 320, "F#2": 302, "G-2": 285,
  "G#2": 269, "A-2": 254, "A#2": 240, "B-2": 226,
  "C-3": 214, "C#3": 202, "D-3": 190, "D#3": 180, "E-3": 170, "F-3": 160, "F#3": 151, "G-3": 143,
  "G#3": 135, "A-3": 127, "A#3": 120, "B-3": 113,
  "C-4": 107, "C#4": 101, "D-4": 95, "D#4": 90, "E-4": 85, "F-4": 80, "F#4": 76, "G-4": 71,
  "G#4": 67, "A-4": 64, "A#4": 60, "B-4": 57,
  "C-5": 54, "C#5": 51, "D-5": 48, "D#5": 45, "E-5": 43, "F-5": 40, "F#5": 38, "G-5": 36,
  "G#5": 34, "A-5": 32, "A#5": 30, "B-5": 28,
  "C-6": 27, "C#6": 25, "D-6": 24, "D#6": 22, "E-6": 21, "F-6": 20, "F#6": 19, "G-6": 18,
  "G#6": 17, "A-6": 16, "A#6": 15, "B-6": 14,
  "C-7": 13, "C#7": 12, "D-7": 11, "D#7": 11, "E-7": 10, "F-7": 10, "F#7": 9, "G-7": 9,
  "G#7": 8, "A-7": 8, "A#7": 7, "B-7": 7,
  "C-8": 6, "C#8": 6, "D-8": 5, "D#8": 5, "E-8": 5, "F-8": 4, "F#8": 4, "G-8": 4,
  "G#8": 3, "A-8": 3, "A#8": 3, "B-8": 3,
};

/**
 * Converts note to target sample rate for resampling.
 * Uses floor division for consistent behavior.
 */
export function noteToTargetHz(note: string): number {
  const period = PAL_PERIODS[note];
  if (period === undefined) {
    throw new Error(`'${note}' is not a valid ProTracker note`);
  }
  return Math.floor(3546895 / period);
}
