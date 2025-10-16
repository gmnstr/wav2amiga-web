# @wav2amiga/resampler-zoh

Zero-order hold (ZOH) resampler for wav2amiga.

## Overview

ZOH is a sample-and-hold resampling method that preserves transients without interpolation or low-pass filtering. This matches the behavior of the Paula chip in Amiga computers, which uses sample-and-hold for audio playback.

## Key Features

- **No interpolation**: Uses exact sample values without smoothing
- **Transient preservation**: Maintains sharp attacks and high-frequency content
- **No low-pass filtering**: Avoids the smoothing effects of traditional resamplers
- **Deterministic**: Pure integer math with consistent results across platforms
- **Paula-compatible**: Mirrors the sample-and-hold behavior of Amiga hardware

## Usage

```typescript
import { createZohResampler } from "@wav2amiga/resampler-zoh";

const resampler = createZohResampler();
const output = resampler.resamplePCM16(inputPcm16, srcHz, dstHz);
```

## Algorithm

The ZOH resampler uses a Bresenham-style fixed-point accumulator:

1. For each output sample, use the current input sample value (sample-and-hold)
2. Advance the accumulator by the source sample rate
3. When the accumulator exceeds the destination sample rate, advance to the next input sample

This ensures that each input sample is held for the appropriate duration in the output, preserving the original waveform characteristics without any filtering artifacts.

## Comparison with Other Resamplers

- **vs. libsamplerate**: ZOH preserves transients that libsamplerate's low-pass filtering would smooth out
- **vs. linear interpolation**: ZOH avoids the intermediate values that linear interpolation would create
- **vs. cubic interpolation**: ZOH maintains sharp edges that cubic interpolation would round off

## Use Cases

ZOH is ideal for:
- Amiga audio conversion (matches Paula chip behavior)
- Preserving drum transients and sharp attacks
- Maintaining high-frequency content in samples
- Any application where transient preservation is more important than smooth interpolation
