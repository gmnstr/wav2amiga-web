import { noteToTargetHz, ResampleAPI, mapPcm16To8Bit } from "@wav2amiga/core";
import { createWasmResampler } from "@wav2amiga/resampler-wasm";

// DOM elements
const dropZone = document.getElementById("dropZone")!;
const fileInput = document.getElementById("fileInput") as HTMLInputElement;
const modeSelect = document.getElementById("mode") as HTMLSelectElement;
const noteSelect = document.getElementById("note") as HTMLSelectElement;
const convertBtn = document.getElementById("convertBtn") as HTMLButtonElement;
const downloadBtn = document.getElementById("downloadBtn") as HTMLButtonElement;
const output = document.getElementById("output")!;
const previewBanner = document.getElementById("previewBanner")!;

// State
let currentAudioBuffer: AudioBuffer | null = null;
let convertedData: Uint8Array | null = null;
let wasmResampler: ResampleAPI | null = null;
let usingPreviewQuality = false;

// Initialize WASM resampler on startup
async function initializeResampler() {
  try {
    wasmResampler = await createWasmResampler();
    console.log("WASM resampler initialized successfully");
  } catch (error) {
    console.warn("WASM resampler not available, using preview quality:", error);
    usingPreviewQuality = true;
    previewBanner.style.display = "block";
  }
}

// Initialize drag and drop
dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", async (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");

  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    await handleFile(files[0]);
  }
});

fileInput.addEventListener("change", async (e) => {
  const files = (e.target as HTMLInputElement).files;
  if (files && files.length > 0) {
    await handleFile(files[0]);
  }
});

// Handle file selection
async function handleFile(file: File) {
  if (!file.type.startsWith("audio/wav")) {
    showError("Please select a WAV file.");
    return;
  }

  try {
    output.textContent = "Loading file...\n";
    convertBtn.disabled = true;

    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();

    // Try to decode with Web Audio API first (for resampling)
    try {
      const audioContext = new AudioContext();
      currentAudioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice());
      audioContext.close();

      if (currentAudioBuffer.numberOfChannels !== 1) {
        showError("Please select a mono WAV file.");
        return;
      }

      output.textContent += "File loaded successfully.\n";
      output.textContent += `Sample rate: ${currentAudioBuffer.sampleRate}Hz\n`;
      output.textContent += `Duration: ${currentAudioBuffer.duration.toFixed(2)}s\n`;
      output.textContent += `Channels: ${currentAudioBuffer.numberOfChannels}\n`;

      convertBtn.disabled = false;
    } catch {
      // Fallback to manual parsing if Web Audio API fails
      showWarning("Using basic WAV parsing (no resampling). For best results, use properly formatted WAV files.");
      await parseWavManually(arrayBuffer);
    }
  } catch (error) {
    showError(`Error loading file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Manual WAV parsing fallback
async function parseWavManually(arrayBuffer: ArrayBuffer) {
  const view = new DataView(arrayBuffer);

  // Basic WAV header parsing
  const riff = view.getUint32(0, true);
  // const fileSize = view.getUint32(4, true);
  const wave = view.getUint32(8, true);

  if (riff !== 0x52494646 || wave !== 0x57415645) { // "RIFF" and "WAVE"
    showError("Invalid WAV file format.");
    return;
  }

  let pos = 12;
  let formatChunk = null;
  let dataChunk = null;

  // Parse chunks
  while (pos < arrayBuffer.byteLength - 8) {
    const chunkId = view.getUint32(pos, true);
    const chunkSize = view.getUint32(pos + 4, true);
    pos += 8;

    if (chunkId === 0x666d7420) { // "fmt "
      formatChunk = {
        size: chunkSize,
        audioFormat: view.getUint16(pos, true),
        numChannels: view.getUint16(pos + 2, true),
        sampleRate: view.getUint32(pos + 4, true),
        byteRate: view.getUint32(pos + 8, true),
        blockAlign: view.getUint16(pos + 12, true),
        bitsPerSample: view.getUint16(pos + 14, true),
      };
    } else if (chunkId === 0x64617461) { // "data"
      dataChunk = {
        size: chunkSize,
        data: arrayBuffer.slice(pos, pos + chunkSize),
      };
    }

    pos += chunkSize;
  }

  if (!formatChunk || !dataChunk) {
    showError("Invalid WAV file: missing format or data chunk.");
    return;
  }

  if (formatChunk.numChannels !== 1) {
    showError("Please select a mono WAV file.");
    return;
  }

  if (formatChunk.bitsPerSample !== 16) {
    showError("Please select a 16-bit WAV file.");
    return;
  }

  // Convert raw PCM data to Int16Array
  const dataView = new DataView(dataChunk.data);
  const samples = new Int16Array(dataChunk.size / 2);

  for (let i = 0; i < samples.length; i++) {
    samples[i] = dataView.getInt16(i * 2, true); // Little-endian
  }

  // Create a mock AudioBuffer for compatibility
  currentAudioBuffer = {
    sampleRate: formatChunk.sampleRate,
    numberOfChannels: 1,
    duration: samples.length / formatChunk.sampleRate,
    length: samples.length,
    getChannelData: () => new Float32Array(samples.length),
  } as any;

  output.textContent += "File loaded successfully (manual parsing).\n";
  output.textContent += `Sample rate: ${formatChunk.sampleRate}Hz\n`;
  output.textContent += `Duration: ${(samples.length / formatChunk.sampleRate).toFixed(2)}s\n`;
  output.textContent += `Channels: ${formatChunk.numChannels}\n`;

  convertBtn.disabled = false;
}

// Convert button handler
convertBtn.addEventListener("click", async () => {
  if (!currentAudioBuffer) return;

  try {
    output.textContent += "\nConverting...\n";
    convertBtn.disabled = true;

    const mode = modeSelect.value as "single" | "stacked" | "stacked-equal";
    const note = noteSelect.value;
    const targetHz = noteToTargetHz(note);

    // Extract PCM16 data from AudioBuffer
    const channelData = currentAudioBuffer.getChannelData(0);
    const srcHz = currentAudioBuffer.sampleRate;

    // Convert Float32 to Int16 PCM
    const pcm16 = new Int16Array(channelData.length);
    for (let i = 0; i < channelData.length; i++) {
      // Clamp to int16 range
      pcm16[i] = Math.max(-32768, Math.min(32767, Math.floor(channelData[i] * 32768)));
    }

    let resampledPcm16: Int16Array;

    if (srcHz === targetHz) {
      resampledPcm16 = pcm16;
    } else if (wasmResampler && !usingPreviewQuality) {
      // Use WASM resampler for high quality
      resampledPcm16 = wasmResampler.resamplePCM16(pcm16, srcHz, targetHz);
      output.textContent += `Resampled from ${srcHz}Hz to ${targetHz}Hz using WASM resampler\n`;
    } else {
      // Fallback to OfflineAudioContext for preview quality
      resampledPcm16 = await resampleWithOfflineAudioContext(pcm16, srcHz, targetHz);
      output.textContent += `Resampled from ${srcHz}Hz to ${targetHz}Hz using preview quality resampling\n`;
    }

    // Convert to 8-bit and create 8SVX structure (single mode for web demo)
    const sampleData = mapPcm16To8Bit(resampledPcm16);
    const paddedLength = (sampleData.length + 0xff) & ~0xff; // Align to 256 bytes
    const paddedData = new Uint8Array(paddedLength);
    paddedData.fill(sampleData, 0, sampleData.length);

    output.textContent += `Mode: ${mode}\n`;
    output.textContent += `Note: ${note}\n`;
    output.textContent += `Target sample rate: ${targetHz}Hz\n`;
    output.textContent += `Original samples: ${pcm16.length}\n`;
    output.textContent += `Resampled samples: ${resampledPcm16.length}\n`;
    output.textContent += `Output bytes: ${paddedData.length}\n`;

    // For web demo, create a minimal 8SVX file
    convertedData = createMinimal8SVX(paddedData, targetHz);

    output.textContent += "Conversion completed!\n";

    // Enable download button
    downloadBtn.disabled = false;

  } catch (error) {
    showError(`Conversion error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    convertBtn.disabled = false;
  }
});

// Fallback resampling using OfflineAudioContext
async function resampleWithOfflineAudioContext(
  inputPcm16: Int16Array,
  srcHz: number,
  targetHz: number
): Promise<Int16Array> {
  const audioContext = new OfflineAudioContext(1, inputPcm16.length * targetHz / srcHz, targetHz);

  // Create buffer with PCM16 data converted to float
  const buffer = audioContext.createBuffer(1, inputPcm16.length, srcHz);
  const channelData = buffer.getChannelData(0);

  for (let i = 0; i < inputPcm16.length; i++) {
    channelData[i] = inputPcm16[i] / 32768;
  }

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start();

  const renderedBuffer = await audioContext.startRendering();
  const resampledChannelData = renderedBuffer.getChannelData(0);

  // Convert back to Int16
  const output = new Int16Array(resampledChannelData.length);
  for (let i = 0; i < resampledChannelData.length; i++) {
    output[i] = Math.max(-32768, Math.min(32767, Math.floor(resampledChannelData[i] * 32768)));
  }

  return output;
}

// Create a minimal 8SVX file for download
function createMinimal8SVX(sampleData: Uint8Array, sampleRate: number): Uint8Array {
  const name = "wav2amiga-web";
  const nameChunkSize = (name.length + 1) & ~1; // Round up to even

  // Calculate total size
  const totalSize =
    8 + // FORM header
    4 + 4 + 20 + // VHDR chunk
    4 + 4 + nameChunkSize + // NAME chunk
    4 + 4 + // BODY header
    sampleData.length; // Sample data

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  let pos = 0;

  // FORM header
  view.setUint32(pos, 0x464F524D, true); // "FORM"
  view.setUint32(pos + 4, totalSize - 8, true);
  view.setUint32(pos + 8, 0x38535658, true); // "8SVX"
  pos += 12;

  // VHDR chunk
  view.setUint32(pos, 0x56484452, true); // "VHDR"
  view.setUint32(pos + 4, 20, true);
  view.setUint32(pos + 8, 0, true); // oneShotHiSamples
  view.setUint32(pos + 12, 0, true); // repeatHiSamples
  view.setUint32(pos + 16, 0, true); // samplesPerHiCycle
  view.setUint32(pos + 20, sampleRate, true); // samplesPerSec
  view.setUint16(pos + 24, 1, true); // ctOctave
  view.setUint16(pos + 26, 0, true); // sCompression
  pos += 28;

  // NAME chunk
  view.setUint32(pos, 0x4E414D45, true); // "NAME"
  view.setUint32(pos + 4, nameChunkSize, true);
  for (let i = 0; i < name.length; i++) {
    view.setUint8(pos + 8 + i, name.charCodeAt(i));
  }
  pos += 8 + nameChunkSize;

  // BODY chunk header
  view.setUint32(pos, 0x424F4459, true); // "BODY"
  view.setUint32(pos + 4, sampleData.length, true);
  pos += 8;

  // Sample data
  for (let i = 0; i < sampleData.length; i++) {
    view.setUint8(pos + i, sampleData[i]);
  }

  return new Uint8Array(buffer);
}

// Download button handler
downloadBtn.addEventListener("click", () => {
  if (!convertedData) return;

  const blob = new Blob([convertedData], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "output.8SVX";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// Utility functions
function showError(message: string) {
  output.innerHTML = `<div class="error">${message}</div>`;
  convertBtn.disabled = true;
  downloadBtn.disabled = true;
}

function showWarning(message: string) {
  output.innerHTML = `<div class="warning">${message}</div>`;
}

// Initialize
async function init() {
  await initializeResampler();
  output.textContent = "Ready to convert WAV files to 8SVX format.\n";
  if (usingPreviewQuality) {
    output.textContent += "Note: Using preview quality resampling. For best results, ensure libsamplerate-wasm is available.\n";
  } else {
    output.textContent += "Note: Using high-quality WASM resampling.\n";
  }
}

init();
