/**
 * Resampler interface for wav2amiga core
 * Narrow interface that accepts PCM16 mono and returns PCM16 mono at target Hz
 */

export interface ResamplerMeta {
  name: 'wasm' | 'ffmpeg' | 'zoh';
  version: string;
  sha256?: string;
}

export interface ResampleAPI {
  meta: ResamplerMeta;
  resamplePCM16(_input: Int16Array, _srcHz: number, _dstHz: number): Int16Array;
}
