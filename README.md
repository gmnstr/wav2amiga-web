# wav2amiga-web

[![CI](https://github.com/gmnstr/wav2amiga-web/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/gmnstr/wav2amiga-web/actions/workflows/ci.yml)
[![Demo](https://img.shields.io/badge/demo-website-blue)](https://gmnstr.github.io/wav2amiga-web/)
[![Version](https://img.shields.io/badge/version-v0.1.0-blue)](https://github.com/gmnstr/wav2amiga-web)

Convert WAV files to Amiga 8SVX format with high-quality resampling.

> 📚 **Comprehensive Documentation**: See [docs/README.md](docs/README.md) for complete guides, API reference, and development documentation.

## Features

- **ZOH (Zero-Order Hold) Resampling**: Default resampler that preserves transients without interpolation or low-pass filtering, matching Paula chip sample-and-hold behavior
- **CLI Tool**: Command-line interface for batch conversion
- **Web Interface**: Browser-based converter with drag-and-drop support
- **Multiple Output Modes**: Single, stacked, and stacked-equal sample layouts
- **Amiga Note Mapping**: Automatic conversion to Amiga period-based sample rates

## Resampling Options

### ZOH (Default)
- **Zero-order hold**: No interpolation, preserves sharp attacks and transients
- **No low-pass filtering**: Maintains high-frequency content
- **Paula-compatible**: Matches Amiga hardware sample-and-hold behavior
- **Deterministic**: Pure integer math with consistent results across platforms

### FFmpeg (Optional)
- **Interpolated resampling**: Uses low-pass filtering for smooth results
- **Comparison mode**: Use `--resampler ffmpeg` to compare with ZOH output

## Usage

### CLI
```bash
# Convert single file with ZOH resampling (default)
wav2amiga --mode single --note C-2 input.wav

# Use FFmpeg resampling for comparison
wav2amiga --mode single --note C-2 --resampler ffmpeg input.wav

# Generate report with metadata
wav2amiga --mode single --note C-2 --emit-report input.wav
```

### Web Interface
Open `apps/web/dist/index.html` in your browser for drag-and-drop conversion.

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run golden tests with ZOH
pnpm test:golden:zoh
```

### Web dev server
```bash
pnpm run web:start   # http://localhost:5173
pnpm run web:stop
pnpm run web:status
# logs: out/logs/web-dev.log
```

> Requires bash (macOS/Linux). On Windows, use Git Bash or WSL.

## Architecture

- **packages/core**: Pure TypeScript business logic
- **packages/resampler-zoh**: Zero-order hold resampler implementation
- **packages/node-io**: FFmpeg-based audio decoding
- **apps/cli**: Command-line interface
- **apps/web**: Browser-based interface

For detailed architecture information, see [System Architecture](docs/architecture.md).

## License

MIT
