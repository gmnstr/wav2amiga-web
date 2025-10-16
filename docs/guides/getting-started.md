# Getting Started

## Quick Start

### Installation

Install the CLI tool globally:
```bash
npm install -g wav2amiga
```

### Your First Conversion

Convert a single WAV file to Amiga 8SVX format:
```bash
wav2amiga --mode single --note C-2 input.wav
```

This creates `input.8SVX` in the current directory.

## What You Need

### Input Requirements
- **Format**: WAV files (PCM 16-bit preferred)
- **Channels**: Mono only (single channel)
- **Content**: Any audio content (drums, synths, vocals, etc.)

### Output
- **Format**: Raw signed 8-bit PCM with `.8SVX` extension
- **Compatibility**: ProTracker, OctaMED, and other Amiga trackers
- **Quality**: High-quality resampling with transient preservation

## Basic Workflows

### Single Sample Conversion
Convert individual samples for use in ProTracker:

```bash
# Convert a kick drum
wav2amiga --mode single --note C-2 kick.wav

# Convert a snare
wav2amiga --mode single --note D-2 snare.wav

# Convert a hi-hat
wav2amiga --mode single --note F#3 hat.wav
```

### Drum Kit Creation
Create a complete drum kit with multiple samples:

```bash
# Create a stacked kit (all samples in one file)
wav2amiga --mode stacked --note C-2 kick.wav snare.wav hat.wav

# Or use a manifest for different notes per sample
echo '[
  {"filepath": "kick.wav", "note": "C-2"},
  {"filepath": "snare.wav", "note": "D-2"},
  {"filepath": "hat.wav", "note": "F#3"}
]' > drumkit.json

wav2amiga --mode stacked --manifest drumkit.json
```

### Batch Processing
Convert multiple files at once:

```bash
# Convert all WAV files in a directory
for file in *.wav; do
  wav2amiga --mode single --note C-2 "$file"
done
```

## Understanding the Output

### File Structure
The generated `.8SVX` files contain:
- Raw signed 8-bit PCM audio data
- No headers (headerless format)
- 0x100-byte alignment for ProTracker compatibility

### ProTracker Integration
1. Load the `.8SVX` file in ProTracker
2. The sample will be automatically detected
3. Use the note you specified for proper playback speed
4. For stacked files, use `9xx` commands to access different segments

### Offset Commands (9xx)
In stacked mode, you can use ProTracker's `9xx` commands to start playback at specific offsets:
- `900`: Start at beginning (offset 0)
- `905`: Start at offset 5 (5 × 256 = 1280 bytes)
- `90A`: Start at offset 10 (10 × 256 = 2560 bytes)

## Common Use Cases

### Electronic Music
Convert modern electronic samples for retro sound:
```bash
# Convert a modern kick for Amiga-style sound
wav2amiga --mode single --note C-2 modern-kick.wav
```

### Game Audio
Create sound effects for Amiga games:
```bash
# Convert sound effects
wav2amiga --mode stacked --manifest sfx.json
```

### Music Production
Use Amiga samples in modern DAWs:
```bash
# Convert samples for use in modern software
wav2amiga --mode single --note C-2 amiga-sample.wav
```

## Tips for Best Results

### Input Preparation
1. **Use mono files**: Convert stereo to mono before processing
2. **Normalize levels**: Ensure good signal-to-noise ratio
3. **Trim silence**: Remove unnecessary silence at start/end
4. **Use 44.1kHz**: Standard sample rate works best

### Note Selection
- **C-2**: Good for kick drums and bass sounds
- **D-2**: Good for snare drums
- **F#3**: Good for hi-hats and cymbals
- **Higher notes**: Good for melodic content

### File Organization
```bash
# Organize by type
mkdir -p samples/{kicks,snares,hats,melodic}

# Convert with organized naming
wav2amiga --mode single --note C-2 kick.wav --out-dir samples/kicks
```

## Troubleshooting

### Common Issues

#### "2 channels detected, expected 1 (mono)"
Your input file is stereo. Convert to mono first:
```bash
# Using FFmpeg
ffmpeg -i stereo.wav -ac 1 mono.wav

# Then convert
wav2amiga --mode single --note C-2 mono.wav
```

#### "File not found"
Check the file path and ensure the file exists:
```bash
ls -la input.wav  # Verify file exists
wav2amiga --mode single --note C-2 ./input.wav  # Use full path
```

#### "Invalid ProTracker note"
Use valid note names:
- Valid: `C-2`, `D#3`, `F#3`
- Invalid: `X-5`, `C2`, `C-2.5`

### Getting Help

#### Verbose Output
Get detailed information about the conversion:
```bash
wav2amiga --mode single --note C-2 --verbose input.wav
```

#### Generate Reports
Create detailed conversion reports:
```bash
wav2amiga --mode single --note C-2 --emit-report input.wav
```

This creates `input_report.json` with segment metadata.

## Next Steps

- Learn about [conversion modes](modes.md) in detail
- Explore [testing and validation](testing.md) options
- Check the [CLI API reference](../api/cli.md) for advanced usage
- Visit the [web interface](https://wav2amiga.github.io) for browser-based conversion
