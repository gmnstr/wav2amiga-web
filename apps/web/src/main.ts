import {
  mapPcm16To8Bit,
  validateMonoPcm16,
  noteToTargetHz,
  generateSingleFilename,
  generateStackedFilename,
  generateStackedEqualFilename,
  calculateStackedEqualLayout,
  alignTo256,
} from "@wav2amiga/core";

// DOM elements
const dropZone = document.getElementById("dropZone")!;
const fileInput = document.getElementById("fileInput") as HTMLInputElement;
const modeSelect = document.getElementById("mode") as HTMLSelectElement;
const noteSelect = document.getElementById("note") as HTMLSelectElement;
const convertBtn = document.getElementById("convertBtn") as HTMLButtonElement;
const downloadBtn = document.getElementById("downloadBtn") as HTMLButtonElement;
const output = document.getElementById("output")!;

// State
let currentAudioBuffer: AudioBuffer | null = null;
let convertedData: Uint8Array | null = null;

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
    } catch (webAudioError) {
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
  const fileSize = view.getUint32(4, true);
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

    // For web demo, we'll simulate the conversion process
    // In a real implementation, we would:
    // 1. Extract PCM16 data from AudioBuffer
    // 2. Resample to target rate using Web Audio API or libsamplerate-wasm
    // 3. Apply the core conversion logic

    // For now, show what would happen
    output.textContent += `Mode: ${mode}\n`;
    output.textContent += `Note: ${note}\n`;
    output.textContent += `Target sample rate: ${targetHz}Hz\n`;

    // Simulate conversion
    await new Promise(resolve => setTimeout(resolve, 1000));

    output.textContent += "Conversion completed!\n";
    output.textContent += "In a full implementation, this would generate an 8SVX file.\n";

    // Enable download button (simulated)
    downloadBtn.disabled = false;
    convertedData = new Uint8Array(1024); // Placeholder

  } catch (error) {
    showError(`Conversion error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    convertBtn.disabled = false;
  }
});

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
output.textContent = "Ready to convert WAV files to 8SVX format.\n";
output.textContent += "Note: This is a preview implementation. Full functionality requires libsamplerate-wasm.\n";
