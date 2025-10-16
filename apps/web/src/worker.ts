/**
 * Web Worker for deterministic WAV to 8SVX conversion
 * Uses ZOH resampler to ensure byte-identical output with CLI
 */

import {
  mapPcm16To8Bit,
  alignTo256,
  noteToTargetHz,
  buildStacked,
  buildStackedEqual,
  filenameForStacked,
  filenameForStackedEqual,
  formatOffsetHex,
  type StackingMode
} from '@wav2amiga/core';
import { createZohResampler } from '@wav2amiga/resampler-zoh';

// Message types
export interface ConvertMsg {
  type: 'convert';
  files: Array<{
    name: string;
    pcm16: Int16Array;
    srcHz: number;
    note: string;
  }>;
  mode: StackingMode;
}

export interface ResultMsg {
  type: 'result';
  output: Uint8Array;
  report: {
    mode: StackingMode;
    outputFile: string;
    segments: Array<{
      label: string;
      note: string;
      targetHz: number;
      startByte: number;
      startOffsetHex: string;
      lengthBytes: number;
      paddedLengthBytes: number;
      paddedLength: number;
      sampleData: { [key: string]: number };
    }>;
    resampler: {
      name: string;
      version: string;
    };
  };
  filename: string;
}

export interface ErrorMsg {
  type: 'error';
  message: string;
}

type WorkerMessage = ConvertMsg;
type WorkerResponse = ResultMsg | ErrorMsg;

// Initialize ZOH resampler
const zohResampler = createZohResampler();

/**
 * Creates 8SVX file structure matching CLI output exactly
 */
function createEightSVXFile(segments: Array<{ sampleData: Uint8Array; targetHz: number }>): Uint8Array {
  if (segments.length === 0) {
    throw new Error('no segments to write');
  }

  // Calculate total file size (matching CLI logic exactly)
  let totalSize = 0;
  
  // FORM header (8 bytes - CLI only counts the size field)
  totalSize += 8;
  
  // VHDR chunk (28 bytes)
  totalSize += 28;
  
  // NAME chunk (variable, but we'll use "wav2amiga")
  const name = "wav2amiga";
  const nameChunkSize = (name.length + 1) & ~1; // Round up to even (10 bytes)
  totalSize += 8 + nameChunkSize;
  
  // BODY chunk header (8 bytes)
  totalSize += 8;
  
  // Sample data (padded to 256-byte boundaries)
  for (const segment of segments) {
    totalSize += segment.sampleData.length;
  }

  // Allocate buffer with actual file size (totalSize + 4 bytes for "FORM" + "8SVX")
  const buffer = new ArrayBuffer(totalSize + 4);
  const view = new DataView(buffer);
  let pos = 0;

  // Write FORM header (big-endian)
  view.setUint32(pos, 0x464F524D, false); // "FORM"
  view.setUint32(pos + 4, totalSize - 8, false);
  view.setUint32(pos + 8, 0x38535658, false); // "8SVX"
  pos += 12;

  // Write VHDR chunk (big-endian)
  view.setUint32(pos, 0x56484452, false); // "VHDR"
  view.setUint32(pos + 4, 20, false); // size
  view.setUint32(pos + 8, 0, false); // oneShotHiSamples
  view.setUint32(pos + 12, 0, false); // repeatHiSamples
  view.setUint32(pos + 16, 0, false); // samplesPerHiCycle
  view.setUint32(pos + 20, segments[0].targetHz, false); // samplesPerSec
  view.setUint16(pos + 24, 1, false); // ctOctave
  view.setUint16(pos + 26, 0, false); // sCompression
  pos += 28;

  // Write NAME chunk
  view.setUint32(pos, 0x4E414D45, false); // "NAME"
  view.setUint32(pos + 4, nameChunkSize, false);
  for (let i = 0; i < name.length; i++) {
    view.setUint8(pos + 8 + i, name.charCodeAt(i));
  }
  // Padding is already zeros from ArrayBuffer
  pos += 8 + nameChunkSize;

  // Write BODY chunk header
  view.setUint32(pos, 0x424F4459, false); // "BODY"
  view.setUint32(pos + 4, totalSize - 8 - 28 - (8 + nameChunkSize) - 8, false);
  pos += 8;

  // Write sample data
  for (const segment of segments) {
    const sampleData = segment.sampleData;
    for (let i = 0; i < sampleData.length; i++) {
      view.setUint8(pos + i, sampleData[i]);
    }
    pos += sampleData.length;
  }

  return new Uint8Array(buffer);
}

/**
 * Processes a single file through the conversion pipeline
 */
function processFile(
  name: string,
  pcm16: Int16Array,
  srcHz: number,
  note: string
): { sampleData: Uint8Array; targetHz: number; metadata: any } {
  const targetHz = noteToTargetHz(note);
  
  // Resample using ZOH
  let resampledPcm16: Int16Array;
  if (srcHz === targetHz) {
    resampledPcm16 = pcm16;
  } else {
    resampledPcm16 = zohResampler.resamplePCM16(pcm16, srcHz, targetHz);
  }
  
  // Convert to 8-bit
  const sampleData8bit = mapPcm16To8Bit(resampledPcm16);
  
    // Align to 256-byte boundary
    const alignedLength = alignTo256(sampleData8bit.length);
    const alignedData = new Uint8Array(alignedLength);
    alignedData.set(sampleData8bit);
    // Fill padding with 0x80 (128) to match CLI
    alignedData.fill(0x80, sampleData8bit.length);
  
  // Convert sampleData to the format expected by CLI reports
  const sampleDataObj: { [key: string]: number } = {};
  for (let i = 0; i < sampleData8bit.length; i++) {
    sampleDataObj[i.toString()] = sampleData8bit[i];
  }

  return {
    sampleData: alignedData,
    targetHz,
    metadata: {
      label: name.replace(/\.wav$/i, ''),
      note,
      targetHz,
      lengthBytes: sampleData8bit.length,
      paddedLengthBytes: alignedLength,
      paddedLength: alignedLength,
      sampleData: sampleDataObj
    }
  };
}

/**
 * Main worker message handler
 */
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  try {
    const { type, files, mode } = event.data;
    
    if (type !== 'convert') {
      throw new Error('unknown message type');
    }
    
    if (files.length === 0) {
      throw new Error('no files provided');
    }
    
    if (mode === 'single' && files.length > 1) {
      throw new Error('single mode requires exactly 1 input file');
    }
    
    // Process all files
    const processedFiles = files.map(file => 
      processFile(file.name, file.pcm16, file.srcHz, file.note)
    );
    
    let output: Uint8Array;
    let segments: any[];
    let filename: string;
    
    if (mode === 'single') {
      // Single mode: one file, one output
      const file = processedFiles[0];
      output = createEightSVXFile([file]);
      segments = [{
        ...file.metadata,
        startByte: 0,
        startOffsetHex: '00'
      }];
      filename = `${file.metadata.label}.8SVX`;
      
    } else if (mode === 'stacked') {
      // Stacked mode: sequential alignment
      const parts = processedFiles.map(f => f.sampleData);
      const { output: stackedOutput, starts } = buildStacked(parts);
      
      // Create 8SVX with concatenated data
      output = createEightSVXFile([{ 
        sampleData: stackedOutput, 
        targetHz: processedFiles[0].targetHz 
      }]);
      
      segments = processedFiles.map((file, i) => ({
        ...file.metadata,
        startByte: starts[i],
        startOffsetHex: formatOffsetHex(starts[i] >> 8)
      }));
      
      filename = filenameForStacked(processedFiles[0].metadata.label, starts);
      
    } else if (mode === 'stacked-equal') {
      // Stacked-equal mode: uniform slots
      const parts = processedFiles.map(f => f.sampleData);
      const { output: stackedOutput, starts, slot } = buildStackedEqual(parts);
      
      // Create 8SVX with concatenated data
      output = createEightSVXFile([{ 
        sampleData: stackedOutput, 
        targetHz: processedFiles[0].targetHz 
      }]);
      
      segments = processedFiles.map((file, i) => ({
        ...file.metadata,
        startByte: starts[i],
        startOffsetHex: formatOffsetHex(starts[i] >> 8)
      }));
      
      filename = filenameForStackedEqual(processedFiles[0].metadata.label, slot);
      
    } else {
      throw new Error(`unknown mode: ${mode}`);
    }
    
    const response: ResultMsg = {
      type: 'result',
      output,
      report: {
        mode,
        outputFile: filename,
        segments,
        resampler: {
          name: 'zoh',
          version: '1.0.0'
        }
      },
      filename
    };
    
    // Transfer the output buffer to avoid copying
    self.postMessage(response, [output.buffer]);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const response: ErrorMsg = {
      type: 'error',
      message: errorMessage
    };
    self.postMessage(response);
  }
};
