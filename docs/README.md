# Wav2Amiga Documentation

[![CI](https://github.com/gmnstr/wav2amiga-web/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/gmnstr/wav2amiga-web/actions/workflows/ci.yml)
[![Demo](https://img.shields.io/badge/demo-website-blue)](https://gmnstr.github.io/wav2amiga-web/)
[![Version](https://img.shields.io/badge/version-v0.1.0-blue)](https://github.com/gmnstr/wav2amiga-web)

Welcome to the comprehensive documentation for Wav2Amiga, a deterministic WAV to Amiga 8SVX converter with high-quality resampling.

## Quick Navigation

### 🚀 Getting Started
- [**Getting Started Guide**](guides/getting-started.md) - Installation and first conversion
- [**Conversion Modes**](guides/modes.md) - Single, Stacked, and StackedEqual modes
- [**Testing Guide**](guides/testing.md) - Running tests and validation

### 📚 API Reference
- [**Core API**](api/core.md) - Core package functions and types
- [**CLI Reference**](api/cli.md) - Command-line interface documentation
- [**Web API**](api/web.md) - Browser-based converter API

### 🏗️ Development
- [**System Architecture**](architecture.md) - Package structure and data flow
- [**Contributing Guide**](development/contributing.md) - Development workflow and standards
- [**CI and Drift Guards**](development/ci-and-drift-guards.md) - Continuous integration system
- [**Golden Tests**](development/golden-tests.md) - Byte-identical output verification

### 📋 Reference
- [**Error Messages**](MESSAGES.md) - Complete CLI error and warning reference
- [**Branch Protection Setup**](development/BRANCH_PROTECTION_SETUP.md) - GitHub branch protection configuration

## What is Wav2Amiga?

Wav2Amiga is a TypeScript-based tool that converts WAV audio files to Amiga 8SVX format with deterministic, high-quality resampling. It's designed for:

- **ProTracker Compatibility**: Creates samples that work perfectly in ProTracker and other Amiga trackers
- **Deterministic Output**: Byte-identical results across all platforms
- **High-Quality Resampling**: Zero-order hold resampler preserves transients and sharp attacks
- **Multiple Output Modes**: Single, Stacked, and StackedEqual modes for different use cases

## Key Features

### 🎵 Audio Processing
- **ZOH Resampler**: Zero-order hold resampling preserves transients without interpolation
- **PAL Note Mapping**: Automatic conversion to Amiga period-based sample rates
- **Mono Support**: Handles mono WAV files with validation
- **16→8 Bit Mapping**: High-quality quantization to signed 8-bit PCM

### 🔧 Output Modes
- **Single Mode**: One .8SVX file per input sample
- **Stacked Mode**: Multiple samples in one file with individual alignment
- **StackedEqual Mode**: Uniform slot sizes for predictable ProTracker offsets

### 🌐 Cross-Platform
- **CLI Tool**: Command-line interface for batch conversion
- **Web Interface**: Browser-based converter with drag-and-drop support
- **Deterministic**: Same inputs produce identical outputs on all platforms

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
Visit [wav2amiga.github.io](https://wav2amiga.github.io) for browser-based conversion.

## Architecture Overview

Wav2Amiga is built as a TypeScript monorepo with clear separation of concerns:

- **`packages/core`**: Pure TypeScript business logic
- **`packages/resampler-zoh`**: Zero-order hold resampler implementation
- **`packages/node-io`**: FFmpeg-based audio decoding
- **`apps/cli`**: Command-line interface
- **`apps/web`**: Browser-based interface

## Testing and Quality

### Comprehensive Testing
- **Unit Tests**: 60+ tests for core logic and resampler
- **Golden Tests**: Byte-identical output verification across platforms
- **CI Pipeline**: Automated testing on Ubuntu, macOS, and Windows
- **Drift Guards**: Toolchain consistency validation

### Deterministic Output
- **ZOH Resampler**: Pure integer math for consistent results
- **Pinned Toolchain**: Exact versions for reproducible builds
- **SHA256 Verification**: Cryptographic validation of outputs
- **Cross-Platform**: Identical results on all supported platforms

## Documentation Structure

### User Guides
- **[Getting Started](guides/getting-started.md)**: Installation, first conversion, basic workflows
- **[Conversion Modes](guides/modes.md)**: Detailed explanation of Single, Stacked, and StackedEqual modes
- **[Testing Guide](guides/testing.md)**: Running tests, validation, and adding new test cases

### API Documentation
- **[Core API](api/core.md)**: Core package functions, types, and usage examples
- **[CLI Reference](api/cli.md)**: Complete command-line interface documentation
- **[Web API](api/web.md)**: Browser-based converter API and integration

### Development Documentation
- **[System Architecture](architecture.md)**: Package structure, data flow, and design principles
- **[Contributing Guide](development/contributing.md)**: Development workflow, coding standards, and PR process
- **[CI and Drift Guards](development/ci-and-drift-guards.md)**: Continuous integration system and drift prevention
- **[Golden Tests](development/golden-tests.md)**: Byte-identical output verification system

### Reference Materials
- **[Error Messages](MESSAGES.md)**: Complete CLI error and warning reference
- **[Branch Protection Setup](development/BRANCH_PROTECTION_SETUP.md)**: GitHub branch protection configuration

## Community and Support

### Getting Help
- **Issues**: Report bugs and request features on GitHub
- **Discussions**: Ask questions and share ideas
- **Documentation**: Comprehensive guides and API reference
- **Examples**: Reproducible test cases with SHA256 verification

### Contributing
We welcome contributions! Please see the [Contributing Guide](development/contributing.md) for:
- Development setup and workflow
- Coding standards and style guidelines
- Testing requirements and golden test management
- Pull request process and review requirements

### Project Status
- **Version**: 0.1.0 (pre-release)
- **Status**: Active development
- **CI**: Green on all platforms
- **Coverage**: Comprehensive test suite

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Original Wav2Amiga Windows tool for inspiration
- ProTracker community for format specifications
- Amiga community for preserving retro computing heritage

---

**Ready to get started?** Check out the [Getting Started Guide](guides/getting-started.md) or visit the [web interface](https://wav2amiga.github.io) for immediate conversion.
