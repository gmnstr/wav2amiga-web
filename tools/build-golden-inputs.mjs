#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";

const repoRoot = process.cwd();
const goldensDir = path.join(repoRoot, "goldens");

function ensureDir(target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
}

function writeWav(filePath, sampleRate, samples) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  let offset = 0;

  buffer.write("RIFF", offset); offset += 4;
  buffer.writeUInt32LE(36 + dataSize, offset); offset += 4;
  buffer.write("WAVE", offset); offset += 4;

  buffer.write("fmt ", offset); offset += 4;
  buffer.writeUInt32LE(16, offset); offset += 4; // PCM
  buffer.writeUInt16LE(1, offset); offset += 2; // PCM format
  buffer.writeUInt16LE(1, offset); offset += 2; // Mono
  buffer.writeUInt32LE(sampleRate, offset); offset += 4;
  buffer.writeUInt32LE(sampleRate * 2, offset); offset += 4; // byte rate
  buffer.writeUInt16LE(2, offset); offset += 2; // block align
  buffer.writeUInt16LE(16, offset); offset += 2; // bits per sample

  buffer.write("data", offset); offset += 4;
  buffer.writeUInt32LE(dataSize, offset); offset += 4;

  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], offset);
    offset += 2;
  }

  fs.writeFileSync(filePath, buffer);
}

function generateSine(length, frequency, sampleRate, amplitude = 0.7) {
  const out = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const phase = (2 * Math.PI * frequency * i) / sampleRate;
    out[i] = Math.round(Math.sin(phase) * amplitude * 32767);
  }
  return out;
}

function generateImpulse(length, index = 0, amplitude = 0.9) {
  const out = new Int16Array(length);
  if (index >= 0 && index < length) {
    out[index] = Math.round(amplitude * 32767);
  }
  return out;
}

function generateStep(length, breakpoint, low = -0.6, high = 0.6) {
  const out = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const value = i < breakpoint ? low : high;
    out[i] = Math.round(value * 32767);
  }
  return out;
}

function generateRamp(length, amplitude = 0.9) {
  const out = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / Math.max(1, length - 1);
    const value = (2 * t - 1) * amplitude;
    out[i] = Math.round(value * 32767);
  }
  return out;
}

const CASES = [
  {
    id: "single_c2_sine",
    files: [
      {
        filename: "input.wav",
        sampleRate: 44100,
        samples: generateSine(4410, 440, 44100),
      },
    ],
  },
  {
    id: "stacked_offsets",
    files: [
      { filename: "input_a.wav", sampleRate: 8287, samples: generateRamp(0x4C0) },
      { filename: "input_b.wav", sampleRate: 8287, samples: generateRamp(0x3A0, 0.6) },
      { filename: "input_c.wav", sampleRate: 8287, samples: generateRamp(0x1C0, 0.4) },
    ],
  },
  {
    id: "stackedequal_uniform",
    files: [
      { filename: "input_a.wav", sampleRate: 8287, samples: generateImpulse(0x4C0, 0) },
      { filename: "input_b.wav", sampleRate: 8287, samples: generateImpulse(0x3A0, 32) },
      { filename: "input_c.wav", sampleRate: 8287, samples: generateImpulse(0x1C0, 8) },
    ],
  },
  {
    id: "aligned_boundary",
    files: [
      { filename: "input.wav", sampleRate: 8287, samples: generateStep(0x100, 0x80) },
    ],
  },
  {
    id: "oversize_warning",
    files: [
      { filename: "input.wav", sampleRate: 400, samples: generateStep(4096, 2048) },
    ],
  },
  {
    id: "silence_minimal",
    files: [
      { filename: "input.wav", sampleRate: 8287, samples: generateImpulse(4, 0, 0) },
    ],
  },
];

for (const testCase of CASES) {
  const caseDir = path.join(goldensDir, "cases", testCase.id);
  ensureDir(caseDir);

  for (const file of testCase.files) {
    const destination = path.join(caseDir, file.filename);
    writeWav(destination, file.sampleRate, file.samples);
    const sizeKb = (fs.statSync(destination).size / 1024).toFixed(2);
    console.log(`${testCase.id}/${file.filename} (${sizeKb} KB)`);
  }
}

console.log("\nGolden input generation complete.");
