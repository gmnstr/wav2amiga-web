/**
 * Deterministic WAV PCM16 mono parser for browser
 * Ensures byte-identical parsing to maintain CLI parity
 */

export interface WavParseResult {
  pcm16: Int16Array;
  srcHz: number;
}

export interface WavMetadata {
  sampleRate: number;
  channels: number;
  bitDepth: number;
  dataSize: number;
}

/**
 * Parses a WAV file from ArrayBuffer, strictly enforcing PCM16 mono format
 * @param arrayBuffer Raw WAV file data
 * @param filename Optional filename for error messages
 * @returns Parsed PCM16 data and sample rate
 * @throws Error with Phase 4 message for unsupported formats
 */
export function parseWavPcm16Mono(arrayBuffer: ArrayBuffer, filename = 'file'): WavParseResult {
  const view = new DataView(arrayBuffer);
  
  // Validate minimum file size
  if (arrayBuffer.byteLength < 44) {
    throw new Error(`${filename}: file too small to be a valid WAV file`);
  }
  
  // Check RIFF header
  const riff = String.fromCharCode(
    view.getUint8(0), view.getUint8(1), 
    view.getUint8(2), view.getUint8(3)
  );
  if (riff !== 'RIFF') {
    throw new Error(`${filename}: not a valid WAV file (missing RIFF header)`);
  }
  
  // Check WAVE format
  const wave = String.fromCharCode(
    view.getUint8(8), view.getUint8(9), 
    view.getUint8(10), view.getUint8(11)
  );
  if (wave !== 'WAVE') {
    throw new Error(`${filename}: not a valid WAV file (missing WAVE format)`);
  }
  
  // Parse chunks
  let pos = 12;
  let formatChunk: WavMetadata | null = null;
  let dataChunk: { offset: number; size: number } | null = null;
  
  while (pos < arrayBuffer.byteLength - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(pos), view.getUint8(pos + 1),
      view.getUint8(pos + 2), view.getUint8(pos + 3)
    );
    const chunkSize = view.getUint32(pos + 4, true); // Little-endian
    
    if (pos + 8 + chunkSize > arrayBuffer.byteLength) {
      throw new Error(`${filename}: invalid WAV file (chunk extends beyond file)`);
    }
    
    if (chunkId === 'fmt ') {
      if (chunkSize < 16) {
        throw new Error(`${filename}: invalid WAV file (fmt chunk too small)`);
      }
      
      const audioFormat = view.getUint16(pos + 8, true);
      const numChannels = view.getUint16(pos + 10, true);
      const sampleRate = view.getUint32(pos + 12, true);
      const bitsPerSample = view.getUint16(pos + 22, true);
      
      // Strict validation for PCM16 mono
      if (audioFormat !== 1) {
        throw new Error(`${filename}: unsupported audio format (browser only supports WAV PCM16 mono)`);
      }
      if (numChannels !== 1) {
        throw new Error(`${filename}: unsupported audio format (browser only supports WAV PCM16 mono)`);
      }
      if (bitsPerSample !== 16) {
        throw new Error(`${filename}: unsupported audio format (browser only supports WAV PCM16 mono)`);
      }
      
      formatChunk = {
        sampleRate,
        channels: numChannels,
        bitDepth: bitsPerSample,
        dataSize: 0 // Will be set when we find data chunk
      };
      
    } else if (chunkId === 'data') {
      dataChunk = {
        offset: pos + 8,
        size: chunkSize
      };
    }
    
    pos += 8 + chunkSize;
  }
  
  if (!formatChunk) {
    throw new Error(`${filename}: invalid WAV file (missing fmt chunk)`);
  }
  if (!dataChunk) {
    throw new Error(`${filename}: invalid WAV file (missing data chunk)`);
  }
  
  // Validate data chunk size
  const expectedDataSize = dataChunk.size;
  if (expectedDataSize % 2 !== 0) {
    throw new Error(`${filename}: invalid WAV file (data chunk size not even for 16-bit samples)`);
  }
  
  const sampleCount = expectedDataSize / 2;
  if (sampleCount === 0) {
    throw new Error(`${filename}: invalid WAV file (no sample data)`);
  }
  
  // Extract PCM16 data (little-endian)
  const pcm16 = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    pcm16[i] = view.getInt16(dataChunk.offset + i * 2, true);
  }
  
  return {
    pcm16,
    srcHz: formatChunk.sampleRate
  };
}

/**
 * Parses WAV metadata without extracting sample data
 * Useful for validation before full parsing
 */
export function parseWavMetadata(arrayBuffer: ArrayBuffer, filename = 'file'): WavMetadata {
  const view = new DataView(arrayBuffer);
  
  if (arrayBuffer.byteLength < 44) {
    throw new Error(`${filename}: file too small to be a valid WAV file`);
  }
  
  // Check RIFF header
  const riff = String.fromCharCode(
    view.getUint8(0), view.getUint8(1), 
    view.getUint8(2), view.getUint8(3)
  );
  if (riff !== 'RIFF') {
    throw new Error(`${filename}: not a valid WAV file (missing RIFF header)`);
  }
  
  // Check WAVE format
  const wave = String.fromCharCode(
    view.getUint8(8), view.getUint8(9), 
    view.getUint8(10), view.getUint8(11)
  );
  if (wave !== 'WAVE') {
    throw new Error(`${filename}: not a valid WAV file (missing WAVE format)`);
  }
  
  // Find fmt chunk
  let pos = 12;
  while (pos < arrayBuffer.byteLength - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(pos), view.getUint8(pos + 1),
      view.getUint8(pos + 2), view.getUint8(pos + 3)
    );
    const chunkSize = view.getUint32(pos + 4, true);
    
    if (chunkId === 'fmt ') {
      if (chunkSize < 16) {
        throw new Error(`${filename}: invalid WAV file (fmt chunk too small)`);
      }
      
      const audioFormat = view.getUint16(pos + 8, true);
      const numChannels = view.getUint16(pos + 10, true);
      const sampleRate = view.getUint32(pos + 12, true);
      const bitsPerSample = view.getUint16(pos + 22, true);
      
      return {
        sampleRate,
        channels: numChannels,
        bitDepth: bitsPerSample,
        dataSize: 0 // Not calculated in metadata-only parse
      };
    }
    
    pos += 8 + chunkSize;
  }
  
  throw new Error(`${filename}: invalid WAV file (missing fmt chunk)`);
}
