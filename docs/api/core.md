# Core Package API Reference

## Overview

The `@wav2amiga/core` package provides the core business logic for WAV to Amiga 8SVX conversion. It contains pure TypeScript functions with no external dependencies.

## Types

### `Mode`
```typescript
type Mode = 'single' | 'stacked' | 'stacked-equal';
```

### `AudioInput`
```typescript
interface AudioInput {
  data: ArrayBuffer;      // Decoded mono PCM16 LE audio data
  label: string;          // Filename or user label (for reporting)
  note: string;           // Target ProTracker note (e.g., 'C-2')
}
```

### `ConvertOpts`
```typescript
interface ConvertOpts {
  mode: Mode;
  globalNote?: string;           // e.g., 'C-2'; required for single, optional if manifest provided
  manifest?: ManifestEntry[];    // per-file notes for stacked modes
}
```

### `ManifestEntry`
```typescript
interface ManifestEntry {
  filename: string;              // input file path or name
  note: string;                  // note per file
}
```

### `SegmentInfo`
```typescript
interface SegmentInfo {
  input: string;
  note: string;
  targetHz: number;
  startByte: number;             // byte offset of segment start in output
  startIndexHex: string;         // (startByte >> 8) as hex string
  lengthBytes: number;           // segment size before padding
  paddedLengthBytes: number;     // segment size including post-segment padding
}
```

### `ConvertResult`
```typescript
interface ConvertResult {
  outputBytes: Uint8Array;       // raw signed-8 PCM
  segments: SegmentInfo[];       // ordered list for report/UI
}
```

## Core Functions

### `convert(inputs: ArrayBuffer[], opts: ConvertOpts): ConvertResult`

Main conversion function that processes audio inputs and produces 8SVX output.

**Parameters:**
- `inputs`: Array of decoded mono PCM16 LE audio data
- `opts`: Conversion options including mode and note configuration

**Returns:**
- `ConvertResult` with raw output bytes and segment metadata

**Example:**
```typescript
import { convert } from '@wav2amiga/core';

const audioData = new ArrayBuffer(1024); // PCM16 mono data
const result = convert([audioData], {
  mode: 'single',
  globalNote: 'C-2'
});

console.log(result.outputBytes); // Uint8Array of 8-bit PCM
console.log(result.segments);    // Array of segment metadata
```

### `alignTo256(length: number): number`

Aligns a length to the next 256-byte boundary for ProTracker 9xx compatibility.

**Parameters:**
- `length`: Input length in bytes

**Returns:**
- Aligned length (next multiple of 256)

**Example:**
```typescript
import { alignTo256 } from '@wav2amiga/core';

console.log(alignTo256(100));   // 256
console.log(alignTo256(256));   // 256 (no change)
console.log(alignTo256(300));   // 512
```

### `mapTo8Bit(sample16: number): number`

Converts a 16-bit PCM sample to 8-bit using arithmetic right shift.

**Parameters:**
- `sample16`: 16-bit signed PCM sample (-32768 to 32767)

**Returns:**
- 8-bit signed sample (-128 to 127)

**Example:**
```typescript
import { mapTo8Bit } from '@wav2amiga/core';

console.log(mapTo8Bit(-32768)); // -128
console.log(mapTo8Bit(0));      // 0
console.log(mapTo8Bit(32767));  // 127
```

## PAL Note Table

### `PAL_NOTES`
Constant array containing all ProTracker PAL notes with their periods and frequencies.

**Structure:**
```typescript
interface NoteEntry {
  note: string;        // e.g., 'C-2'
  period: number;      // ProTracker period value
  frequency: number;   // Calculated frequency in Hz
}
```

**Example:**
```typescript
import { PAL_NOTES } from '@wav2amiga/core';

const c2Note = PAL_NOTES.find(note => note.note === 'C-2');
console.log(c2Note?.frequency); // 8287.136916
```

### `getNoteFrequency(note: string): number`

Gets the target frequency for a ProTracker note.

**Parameters:**
- `note`: ProTracker note string (e.g., 'C-2')

**Returns:**
- Frequency in Hz

**Throws:**
- Error if note is invalid

**Example:**
```typescript
import { getNoteFrequency } from '@wav2amiga/core';

const freq = getNoteFrequency('C-2'); // 8287.136916
```

## Filename Generation

### `generateFilename(segments: SegmentInfo[], mode: Mode, baseName: string): string`

Generates appropriate filename based on mode and segment information.

**Parameters:**
- `segments`: Array of segment metadata
- `mode`: Conversion mode
- `baseName`: Base filename (without extension)

**Returns:**
- Generated filename with .8SVX extension

**Examples:**
```typescript
import { generateFilename } from '@wav2amiga/core';

// Single mode
const singleName = generateFilename(segments, 'single', 'kick');
// Returns: 'kick.8SVX'

// Stacked mode
const stackedName = generateFilename(segments, 'stacked', 'kit');
// Returns: 'kit_00_05_0A.8SVX'

// StackedEqual mode
const equalName = generateFilename(segments, 'stacked-equal', 'kit');
// Returns: 'kit_05.8SVX'
```

## Constants

### `PAL_CLOCK`
```typescript
const PAL_CLOCK = 3546895; // Amiga PAL clock frequency
```

### `ALIGN`
```typescript
const ALIGN = 256; // ProTracker alignment boundary
```

## Error Handling

The core package throws errors for invalid inputs:

- **Invalid note**: `Error: 'X-5' is not a valid ProTracker note`
- **Empty inputs**: `Error: No audio inputs provided`
- **Invalid mode**: `Error: Invalid mode: 'invalid'`

## Usage Patterns

### Single Mode Conversion
```typescript
const result = convert([audioData], {
  mode: 'single',
  globalNote: 'C-2'
});
```

### Stacked Mode with Manifest
```typescript
const result = convert([kickData, snareData], {
  mode: 'stacked',
  manifest: [
    { filename: 'kick.wav', note: 'C-2' },
    { filename: 'snare.wav', note: 'D-2' }
  ]
});
```

### StackedEqual Mode
```typescript
const result = convert([kickData, snareData, hatData], {
  mode: 'stacked-equal',
  globalNote: 'C-2'
});
```

## Performance Considerations

- All functions are pure and deterministic
- No external dependencies or I/O operations
- Optimized for typical sample lengths (< 10 seconds)
- Memory efficient with streaming-friendly design
