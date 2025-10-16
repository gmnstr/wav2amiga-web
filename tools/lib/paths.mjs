import path from 'node:path';

export const OUT_DIR = process.env.W2A_OUT_DIR ?? 'out';
export const OUT_DIFF = path.join(OUT_DIR, 'diff');
export const OUT_PKG = path.join(OUT_DIR, 'pkg');
export const OUT_GOLDEN_RUN = path.join(OUT_DIR, 'goldens-run');
export const OUT_BENCH = path.join(OUT_DIR, 'bench');
