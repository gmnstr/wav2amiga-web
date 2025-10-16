import { ResampleAPI, ResamplerMeta } from "@wav2amiga/core";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Read VERSION.json for metadata
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERSION_PATH = path.resolve(__dirname, "../VERSION.json");

interface VersionInfo {
  version: string;
  sha256: string;
  flags: string;
}

let versionInfo: VersionInfo | null = null;

function getVersionInfo(): VersionInfo {
  if (!versionInfo) {
    try {
      const content = fs.readFileSync(VERSION_PATH, "utf-8");
      versionInfo = JSON.parse(content) as VersionInfo;
    } catch {
      // Fallback if VERSION.json doesn't exist yet
      versionInfo = {
        version: "1.0.0",
        sha256: "unknown",
        flags: "SINC_BEST_QUALITY"
      };
    }
  }
  return versionInfo!;
}

// WASM exports interface (matches libsamplerate)
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
  // Constants from libsamplerate
  SRC_SINC_BEST_QUALITY: number;
}

class WasmResampler implements ResampleAPI {
  private instance: WebAssembly.Instance & { exports: LibsamplerateExports };
  private _meta: ResamplerMeta;

  constructor(instance: WebAssembly.Instance & { exports: LibsamplerateExports }) {
    this.instance = instance;
    const versionInfo = getVersionInfo();
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
    const outputFrames = Math.ceil(inputFrames * ratio) + 1024; // Add some buffer

    // Allocate memory for input and output
    const inputPtr = this.instance.exports.malloc(inputFrames * 2); // 2 bytes per sample
    const outputPtr = this.instance.exports.malloc(outputFrames * 2);

    try {
      // Copy input data to WASM memory
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

      // Call libsamplerate
      const result = this.instance.exports.src_simple(
        inputPtr,
        inputFrames,
        outputPtr,
        outputFrames,
        srcHz,
        dstHz,
        1 // mono
      );

      if (result < 0) {
        throw new Error(`libsamplerate error: ${result}`);
      }

      // Read output data from WASM memory
      const outputMemory = this.instance.exports as any;
      if (!outputMemory.memory) {
        throw new Error("WASM instance does not have exported memory");
      }
      const outputView = new Int16Array(
        outputMemory.memory.buffer,
        outputPtr,
        result
      );

      // Copy to new array and clamp to int16 range
      const output = new Int16Array(result);
      for (let i = 0; i < result; i++) {
        // Clamp to int16 range (-32768 to 32767)
        output[i] = Math.max(-32768, Math.min(32767, outputView[i]));
      }

      return output;
    } finally {
      // Free allocated memory
      this.instance.exports.free(inputPtr);
      this.instance.exports.free(outputPtr);
    }
  }
}

async function loadWasmBytes(): Promise<Uint8Array> {
  const wasmPath = path.resolve(__dirname, "../assets/libsamplerate.wasm");

  // Check if WASM file exists
  if (!fs.existsSync(wasmPath)) {
    throw new Error(
      `WASM file not found at ${wasmPath}. ` +
      `Run 'tools/pin-wasm.mjs' to download and pin the WASM artifact.`
    );
  }

  return fs.promises.readFile(wasmPath);
}

export async function createWasmResampler(): Promise<ResampleAPI> {
  const wasmBytes = await loadWasmBytes();

  // Instantiate WASM module
  let instance: WebAssembly.Instance & { exports: LibsamplerateExports };

  try {
    // Try instantiateStreaming first (Node 16+)
    const module = await WebAssembly.instantiate(wasmBytes);
    instance = module.instance as WebAssembly.Instance & { exports: LibsamplerateExports };
  } catch {
    // Fallback to instantiate (older Node or Windows)
    const module = await WebAssembly.instantiate(wasmBytes);
    instance = module.instance as WebAssembly.Instance & { exports: LibsamplerateExports };
  }

  // Verify required exports
  const exports = instance.exports;
  if (!exports.malloc || !exports.free || !exports.src_simple) {
    throw new Error("WASM module missing required libsamplerate exports");
  }

  return new WasmResampler(instance);
}
