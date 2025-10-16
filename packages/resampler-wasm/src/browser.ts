import { ResampleAPI, ResamplerMeta } from "@wav2amiga/core";

interface VersionInfo {
  version: string;
  sha256: string;
  flags: string;
}

interface LibsamplerateExports {
  malloc(_size: number): number;
  free(_ptr: number): void;
  src_simple(
    _data_in: number,
    _input_frames: number,
    _data_out: number,
    _output_frames: number,
    _input_rate: number,
    _output_rate: number,
    _channels: number
  ): number;
  SRC_SINC_BEST_QUALITY: number;
  memory?: WebAssembly.Memory;
}

class WasmResampler implements ResampleAPI {
  private instance: WebAssembly.Instance & { exports: LibsamplerateExports };
  private _meta: ResamplerMeta;

  constructor(instance: WebAssembly.Instance & { exports: LibsamplerateExports }, versionInfo: VersionInfo) {
    this.instance = instance;
    this._meta = {
      name: 'wasm',
      version: versionInfo.version,
      sha256: versionInfo.sha256
    };
  }

  get meta(): ResamplerMeta {
    return this._meta;
  }

  resamplePCM16(input: Int16Array, srcHz: number, dstHz: number): Int16Array {
    if (srcHz === dstHz) {
      return input.slice();
    }

    const inputFrames = input.length;
    const ratio = dstHz / srcHz;
    const outputFrames = Math.ceil(inputFrames * ratio) + 1024;

    const inputPtr = this.instance.exports.malloc(inputFrames * 2);
    const outputPtr = this.instance.exports.malloc(outputFrames * 2);

    try {
      const wasmExports = this.instance.exports as any;
      if (!wasmExports.memory) {
        throw new Error("WASM instance does not have exported memory");
      }
      const inputView = new Int16Array(
        wasmExports.memory.buffer,
        inputPtr,
        inputFrames
      );
      inputView.set(input);

      const result = this.instance.exports.src_simple(
        inputPtr,
        inputFrames,
        outputPtr,
        outputFrames,
        srcHz,
        dstHz,
        1
      );

      if (result < 0) {
        throw new Error(`libsamplerate error: ${result}`);
      }

      const outputMemory = this.instance.exports as any;
      if (!outputMemory.memory) {
        throw new Error("WASM instance does not have exported memory");
      }
      const outputView = new Int16Array(
        outputMemory.memory.buffer,
        outputPtr,
        result
      );

      const output = new Int16Array(result);
      for (let i = 0; i < result; i++) {
        output[i] = Math.max(-32768, Math.min(32767, outputView[i]));
      }

      return output;
    } finally {
      this.instance.exports.free(inputPtr);
      this.instance.exports.free(outputPtr);
    }
  }
}

export async function createWasmResampler(): Promise<ResampleAPI> {
  // In browser, fetch WASM from assets and VERSION.json from public
  const [wasmResponse, versionResponse] = await Promise.all([
    fetch('/assets/libsamplerate.wasm'),
    fetch('/VERSION.json')
  ]);

  if (!wasmResponse.ok) {
    throw new Error(`Failed to fetch WASM file: ${wasmResponse.statusText}`);
  }

  const wasmBytes = await wasmResponse.arrayBuffer();
  const versionInfo: VersionInfo = versionResponse.ok 
    ? await versionResponse.json()
    : { version: "1.0.0", sha256: "unknown", flags: "SINC_BEST_QUALITY" };

  let instance: WebAssembly.Instance & { exports: LibsamplerateExports };

  try {
    const module = await WebAssembly.instantiate(wasmBytes);
    instance = module.instance as WebAssembly.Instance & { exports: LibsamplerateExports };
  } catch {
    const module = await WebAssembly.instantiate(wasmBytes);
    instance = module.instance as WebAssembly.Instance & { exports: LibsamplerateExports };
  }

  const exports = instance.exports;
  if (!exports.malloc || !exports.free || !exports.src_simple) {
    throw new Error("WASM module missing required libsamplerate exports");
  }

  return new WasmResampler(instance, versionInfo);
}

