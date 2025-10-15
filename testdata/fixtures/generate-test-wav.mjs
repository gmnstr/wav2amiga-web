#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Generates a simple mono WAV file with a sine wave
 * Used for testing wav2amiga conversion
 */

// WAV file format constants
const RIFF_HEADER_SIZE = 12;
const FMT_CHUNK_SIZE = 24;
const DATA_CHUNK_SIZE = 0; // Will be calculated

function writeUInt16LE(buffer, offset, value) {
  buffer[offset] = value & 0xFF;
  buffer[offset + 1] = (value >> 8) & 0xFF;
}

function writeUInt32LE(buffer, offset, value) {
  buffer[offset] = value & 0xFF;
  buffer[offset + 1] = (value >> 8) & 0xFF;
  buffer[offset + 2] = (value >> 16) & 0xFF;
  buffer[offset + 3] = (value >> 24) & 0xFF;
}

function writeInt16LE(buffer, offset, value) {
  writeUInt16LE(buffer, offset, value < 0 ? value + 0x10000 : value);
}

/**
 * Generate a WAV file with a sine wave
 * @param {string} filename Output filename
 * @param {number} sampleRate Sample rate in Hz
 * @param {number} frequency Sine wave frequency in Hz
 * @param {number} duration Duration in seconds
 * @param {number} amplitude Amplitude (0.0 to 1.0)
 */
function generateWavFile(filename, sampleRate, frequency, duration, amplitude = 0.5) {
  const numSamples = Math.floor(sampleRate * duration);
  const dataSize = numSamples * 2; // 16-bit samples
  const fileSize = RIFF_HEADER_SIZE + FMT_CHUNK_SIZE + 8 + dataSize; // 8 for "WAVE" + fmt chunk + data chunk header

  const buffer = Buffer.alloc(RIFF_HEADER_SIZE + FMT_CHUNK_SIZE + 8 + dataSize);

  let offset = 0;

  // RIFF header
  buffer.write("RIFF", offset); offset += 4;
  writeUInt32LE(buffer, offset, fileSize - 8); offset += 4; // File size - 8
  buffer.write("WAVE", offset); offset += 4;

  // fmt chunk
  buffer.write("fmt ", offset); offset += 4;
  writeUInt32LE(buffer, offset, FMT_CHUNK_SIZE); offset += 4; // Chunk size
  writeUInt16LE(buffer, offset, 1); offset += 2; // Audio format (PCM)
  writeUInt16LE(buffer, offset, 1); offset += 2; // Number of channels (mono)
  writeUInt32LE(buffer, offset, sampleRate); offset += 4; // Sample rate
  writeUInt32LE(buffer, offset, sampleRate * 2); offset += 4; // Byte rate
  writeUInt16LE(buffer, offset, 2); offset += 2; // Block align
  writeUInt16LE(buffer, offset, 16); offset += 2; // Bits per sample

  // data chunk
  buffer.write("data", offset); offset += 4;
  writeUInt32LE(buffer, offset, dataSize); offset += 4;

  // Generate sine wave samples
  for (let i = 0; i < numSamples; i++) {
    const time = i / sampleRate;
    const sampleValue = Math.sin(2 * Math.PI * frequency * time) * amplitude * 32767;
    writeInt16LE(buffer, offset, Math.round(sampleValue));
    offset += 2;
  }

  fs.writeFileSync(filename, buffer);
  console.log(`Generated ${filename}: ${sampleRate}Hz, ${frequency}Hz sine wave, ${duration}s duration`);
}

// Generate test files
const fixturesDir = path.join(process.cwd(), "testdata", "fixtures");

// C-2 note frequency (approximately 65.41 Hz)
// Target sample rate for C-2 is 8287 Hz according to PAL periods
const c2Frequency = 65.41;
const targetSampleRate = 8287;

generateWavFile(
  path.join(fixturesDir, "c2-sine-48khz.wav"),
  48000, // Common sample rate
  c2Frequency,
  0.1, // 0.1 seconds duration for small file size
  0.5
);

generateWavFile(
  path.join(fixturesDir, "c2-sine-44khz.wav"),
  44100, // Another common sample rate
  c2Frequency,
  0.1,
  0.5
);

// Also create a file at the target sample rate for testing
generateWavFile(
  path.join(fixturesDir, "c2-sine-8287hz.wav"),
  targetSampleRate,
  c2Frequency,
  0.1,
  0.5
);

console.log("Test WAV files generated successfully!");
