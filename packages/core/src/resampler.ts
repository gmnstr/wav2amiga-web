/**
 * Resampler interface for wav2amiga core
 * Narrow interface that accepts PCM16 mono and returns PCM16 mono at target Hz
 */

export interface ResamplerMeta {
  name: 'wasm' | 'ffmpeg';
  version: string;
  sha256?: string;
}

export interface ResampleAPI {
  meta: ResamplerMeta;
  resamplePCM16(input: Int16Array, srcHz: number, dstHz: number): Int16Array;
}
