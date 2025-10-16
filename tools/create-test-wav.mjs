#!/usr/bin/env node

import * as fs from "node:fs";

// Create a simple mono 16-bit WAV file with a few samples
const sampleRate = 8000;
const duration = 0.1; // 100ms
const numSamples = Math.floor(sampleRate * duration);

// WAV file structure
const chunkSize = 36 + numSamples * 2; // fmt chunk + data chunk
const subchunk1Size = 16; // PCM format
const subchunk2Size = numSamples * 2; // audio data size

const buffer = Buffer.alloc(44 + numSamples * 2);
let offset = 0;

// RIFF header
buffer.write("RIFF", offset); offset += 4;
buffer.writeUInt32LE(chunkSize, offset); offset += 4;
buffer.write("WAVE", offset); offset += 4;

// fmt chunk
buffer.write("fmt ", offset); offset += 4;
buffer.writeUInt32LE(subchunk1Size, offset); offset += 4;
buffer.writeUInt16LE(1, offset); offset += 2; // Audio format (PCM)
buffer.writeUInt16LE(1, offset); offset += 2; // Number of channels
buffer.writeUInt32LE(sampleRate, offset); offset += 4; // Sample rate
buffer.writeUInt32LE(sampleRate * 2, offset); offset += 4; // Byte rate
buffer.writeUInt16LE(2, offset); offset += 2; // Block align
buffer.writeUInt16LE(16, offset); offset += 2; // Bits per sample

// data chunk
buffer.write("data", offset); offset += 4;
buffer.writeUInt32LE(subchunk2Size, offset); offset += 4;

// Generate simple sine wave samples
for (let i = 0; i < numSamples; i++) {
  const time = i / sampleRate;
  const sampleValue = Math.sin(2 * Math.PI * 440 * time) * 16384; // 440Hz sine wave
  buffer.writeInt16LE(Math.round(sampleValue), offset);
  offset += 2;
}

fs.writeFileSync("/tmp/valid.wav", buffer);
console.log("Created valid WAV file at /tmp/valid.wav");
