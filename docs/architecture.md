# System Architecture

## Overview

Wav2Amiga-Web is a TypeScript monorepo that converts WAV audio files to Amiga 8SVX format with deterministic, high-quality resampling. The system is designed for cross-platform compatibility and byte-identical outputs.

## Package Structure

### Core Packages

#### `packages/core`
- **Purpose**: Pure TypeScript business logic
- **Responsibilities**:
  - PAL note table and frequency calculations
  - 16-bit to 8-bit PCM mapping
  - 0x100-byte alignment and padding
  - Stacked and StackedEqual mode logic
  - Filename generation conventions
- **Dependencies**: None (pure TypeScript)
- **Key Exports**: `convert()`, `alignTo256()`, `mapTo8Bit()`

#### `packages/resampler-zoh`
- **Purpose**: Zero-order hold resampler implementation
- **Responsibilities**:
  - Deterministic resampling without interpolation
  - Preserves transients and sharp attacks
  - Matches Amiga Paula chip sample-and-hold behavior
- **Dependencies**: None (pure TypeScript)
- **Key Exports**: `ZOHResampler`, resampling functions

#### `packages/resampler-wasm`
- **Purpose**: WebAssembly-based resampler (optional)
- **Responsibilities**:
  - High-quality resampling using libsamplerate
  - Cross-platform deterministic output
  - Browser and Node.js compatibility
- **Dependencies**: WASM binary, libsamplerate
- **Key Exports**: WASM resampler interface

#### `packages/node-io`
- **Purpose**: Node.js adapters for file I/O and audio processing
- **Responsibilities**:
  - FFmpeg-based audio decoding
  - File system operations
  - Process integration
- **Dependencies**: `ffmpeg-static`, `execa`
- **Key Exports**: File I/O functions, FFmpeg integration

### Applications

#### `apps/cli`
- **Purpose**: Command-line interface
- **Responsibilities**:
  - Yargs-based argument parsing
  - CLI error handling and messaging
  - Integration with core and node-io packages
- **Dependencies**: `@wav2amiga/core`, `@wav2amiga/node-io`, `yargs`
- **Key Exports**: CLI executable

#### `apps/web`
- **Purpose**: Browser-based converter
- **Responsibilities**:
  - Drag-and-drop file interface
  - In-browser audio processing
  - Download functionality
- **Dependencies**: `@wav2amiga/core`, Vite, React
- **Key Exports**: Web application

## Data Flow

### 1. Input Processing
```
WAV File → FFmpeg Decode → PCM16 Mono → Validation
```

### 2. Resampling
```
PCM16 Mono → ZOH Resampler → Target PAL Rate → PCM16 Mono
```

### 3. Quantization
```
PCM16 Mono → 16→8 Mapping → Signed 8-bit PCM
```

### 4. Alignment & Stacking
```
8-bit PCM → 0x100 Alignment → Mode-specific Stacking → Raw Output
```

### 5. Output Generation
```
Raw Output → Filename Generation → .8SVX File + JSON Report
```

## Resampler Strategy

### ZOH (Zero-Order Hold) - Default
- **Algorithm**: No interpolation, preserves sharp attacks
- **Determinism**: Pure integer math, byte-identical across platforms
- **Use Case**: ProTracker samples, transient preservation
- **Performance**: Fast, no external dependencies

### FFmpeg (Optional)
- **Algorithm**: Interpolated resampling with low-pass filtering
- **Determinism**: Platform-dependent, used for comparison
- **Use Case**: Alternative resampling for comparison
- **Performance**: Slower, requires FFmpeg binary

### WASM (Optional)
- **Algorithm**: libsamplerate SINC_BEST_QUALITY
- **Determinism**: Cross-platform with same WASM binary
- **Use Case**: High-quality resampling in browser
- **Performance**: Medium, requires WASM loading

## File Organization

### Golden Tests
- **Location**: `goldens/cases/`
- **Purpose**: Byte-identical output verification
- **Structure**: Input WAVs, expected outputs, SHA256 hashes
- **Validation**: CI-gated cross-platform testing

### Test Data
- **Location**: `testdata/fixtures/`
- **Purpose**: Unit test audio samples
- **Format**: Small mono WAV files for testing

### Tools
- **Location**: `tools/`
- **Purpose**: Build automation and testing utilities
- **Scripts**: Golden regeneration, version checking, drift guards

## Build System

### Monorepo Management
- **Package Manager**: pnpm with workspaces
- **Build Tool**: TypeScript compiler
- **Testing**: Vitest for unit tests
- **Linting**: ESLint with Prettier

### CI/CD Pipeline
- **Platforms**: Ubuntu, macOS, Windows
- **Tests**: Unit tests, golden byte-equal tests
- **Artifacts**: CLI package, web dist, version info
- **Deployment**: NPM publishing, GitHub Pages

## Key Design Principles

### Determinism
- Byte-identical outputs across platforms
- Pure integer math where possible
- Pinned toolchain versions
- CI-gated golden tests

### Modularity
- Clear separation of concerns
- Pure functions in core package
- Platform-specific adapters
- Minimal dependencies

### Performance
- Fast resampling algorithms
- Efficient memory usage
- Optimized for typical sample lengths
- Background processing in web app

### Maintainability
- Comprehensive test coverage
- Clear API boundaries
- Extensive documentation
- Drift guard automation
