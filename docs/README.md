# Wav2Amiga Documentation

[![CI](https://github.com/gmnstr/wav2amiga-web/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/gmnstr/wav2amiga-web/actions/workflows/ci.yml)
[![Demo](https://img.shields.io/badge/demo-website-blue)](https://gmnstr.github.io/wav2amiga-web/)
[![Version](https://img.shields.io/badge/version-v0.1.0-blue)](https://github.com/gmnstr/wav2amiga-web)

Convert WAV files to Amiga 8SVX format with high-quality resampling.

## Quick Navigation

### Getting Started

- [**Getting Started Guide**](guides/getting-started.md) - Installation and first conversion
- [**Conversion Modes**](guides/modes.md) - Single, Stacked, and StackedEqual modes
- [**Testing Guide**](guides/testing.md) - Running tests and validation

### API Reference

- [**Core API**](api/core.md) - Core package functions and types
- [**CLI Reference**](api/cli.md) - Command-line interface documentation
- [**Web API**](api/web.md) - Browser-based converter API

### Development

- [**System Architecture**](architecture.md) - Package structure and data flow
- [**Contributing Guide**](development/contributing.md) - Development workflow and standards
- [**Golden Tests**](development/golden-tests.md) - Byte-identical output verification

### Reference

- [**Error Messages**](MESSAGES.md) - Complete CLI error and warning reference

## What is Wav2Amiga?

Wav2Amiga converts WAV audio files to Amiga 8SVX format with deterministic, high-quality resampling.

## Features

- **ProTracker Compatibility**: Creates samples that work perfectly in ProTracker and other Amiga trackers
- **Deterministic Output**: Byte-identical results across all platforms
- **ZOH Resampler**: Zero-order hold resampling preserves transients without interpolation
- **Multiple Output Modes**: Single, Stacked, and StackedEqual modes for different use cases
- **CLI Tool**: Command-line interface for batch conversion
- **Web Interface**: Browser-based converter with drag-and-drop support

## Quick Start

### Installation

```bash
npm install -g wav2amiga
```

### Basic Usage

```bash
# Convert a single sample
wav2amiga --mode single --note C-2 input.wav

# Create a drum kit
wav2amiga --mode stacked --note C-2 kick.wav snare.wav hat.wav
```

### Web Interface

Visit [gmnstr.github.io/wav2amiga-web](https://gmnstr.github.io/wav2amiga-web/) for browser-based conversion.

## Architecture

- **`packages/core`**: Pure TypeScript business logic
- **`packages/resampler-zoh`**: Zero-order hold resampler implementation
- **`packages/node-io`**: FFmpeg-based audio decoding
- **`apps/cli`**: Command-line interface
- **`apps/web`**: Browser-based interface

## Credits

This project is a TypeScript port of [Wav2Amiga](https://github.com/djh0ffman/Wav2Amiga) by [djh0ffman](https://github.com/djh0ffman). The original Amiga 8SVX conversion logic and resampling approach were adapted from the C# reference implementation.

## License

MIT
