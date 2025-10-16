# wav2amiga-web

A deterministic web application for converting WAV files to Amiga 8SVX format using Zero-Order Hold (ZOH) resampling.

## Features

- **Deterministic Conversion**: Byte-identical output to the CLI version for WAV PCM16 mono inputs
- **ZOH Resampler**: Uses Zero-Order Hold resampling to match Amiga Paula chip behavior
- **Multiple Modes**: Single, Stacked, and Stacked-Equal conversion modes
- **Per-File Note Selection**: Choose Amiga period-based notes for each sample
- **Real-time Processing**: Web Worker-based conversion keeps UI responsive
- **Download Support**: Direct download of .8SVX files and conversion reports

## Browser Support

- **Modern Browsers**: Chrome 88+, Firefox 78+, Safari 14+, Edge 88+
- **Web Workers**: Required for background processing
- **ArrayBuffer Transfer**: Used for efficient data transfer between main thread and worker

## Supported Formats

- **Input**: WAV PCM16 mono files only
- **Output**: Amiga 8SVX format with deterministic byte layout

## Usage

1. **Drag & Drop**: Drag WAV files onto the upload area or click to select
2. **Select Mode**: Choose between Single, Stacked, or Stacked-Equal modes
3. **Set Notes**: Select Amiga period-based notes for each file (default: C-2 ≈ 8287 Hz)
4. **Convert**: Click "Convert" to process files using ZOH resampler
5. **Download**: Download the generated .8SVX file and conversion report

## Conversion Modes

- **Single**: Convert one file to one 8SVX sample
- **Stacked**: Combine multiple files with consecutive offsets
- **Stacked-Equal**: Like stacked, but with equal-sized slots for each sample

## Technical Details

- **Deterministic**: Uses the same ZOH resampler and core logic as the CLI
- **Byte-Identical**: Output matches CLI exactly for the same inputs
- **Web Worker**: Conversion runs in background thread to maintain UI responsiveness
- **ArrayBuffer Transfer**: Efficient data transfer without copying large audio buffers

## Error Handling

The application provides specific error messages for unsupported formats:

- `{filename}: unsupported audio format (browser only supports WAV PCM16 mono)`
- `single mode requires exactly 1 input file`
- `'{note}' is not a valid ProTracker note`

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# Run tests once
pnpm test:run
```

## Architecture

- **React 18**: Modern React with hooks and TypeScript
- **Vite**: Fast build tool with HMR
- **Tailwind CSS**: Utility-first CSS framework
- **Web Workers**: Background processing with ES modules
- **ZOH Resampler**: Deterministic audio resampling
- **8SVX Format**: Amiga sample format with proper chunk structure

## Testing

The application includes comprehensive tests:

- **Unit Tests**: WAV parser validation and error handling
- **Worker Tests**: Conversion logic and 8SVX file generation
- **Parity Tests**: Byte-identical output verification against CLI goldens

## Determinism Guarantee

The web application produces byte-identical output to the CLI version when:

- Input is WAV PCM16 mono format
- Same note selection and mode
- Same ZOH resampler version

This ensures consistent results across different platforms and environments.
