# Core Package Invariants and Semantics

## Alignment Policy

- **ALIGN constant**: `0x100` (256 bytes) - the fundamental alignment boundary for 8SVX sample data
- **alignTo256(n)**: Rounds up to next 256-byte boundary: `(n + 0xFF) & ~0xFF`
- **isAligned256(n)**: Checks if `n` is aligned to 256-byte boundary: `(n & 0xFF) === 0`
- **Invariant**: No extra padding when already aligned - `alignTo256(0x100) === 0x100`

## Stacked Mode Semantics

- **buildStacked(parts)**: Concatenates segments sequentially with 0x100-aligned padding
- **Start offsets**: `start(i) = sum_{k < i} alignTo256(len_k)`
- **Physical layout**: Each segment occupies its aligned length, with padding zeros between segments
- **Use case**: Enables precise `9xx` offset calculations in ProTracker

## StackedEqual Mode Semantics

- **buildStackedEqual(parts)**: Creates uniform slots for equal spacing
- **Slot size**: `max_i alignTo256(len_i)` - largest aligned segment length
- **Start offsets**: `start(i) = i * slot` - uniform increment pattern
- **Physical layout**: Each segment padded to slot size, creating predictable spacing
- **Use case**: Enables consistent offset arithmetic: `offset = base + (index × increment)`

## Offset and Filename Conventions

- **Offset calculation**: `(startByte >> 8)` - convert bytes to 256-byte pages
- **Hex formatting**: Uppercase, minimum 2 characters, zero-padded
- **Stacked filenames**: `basename_00_05_09.8SVX` - all segment offsets included
- **StackedEqual filenames**: `basename_XX.8SVX` - only increment value
- **Extension**: Always `.8SVX` (uppercase) for raw signed 8-bit PCM data

## Implementation Notes

- All builders return zero-padded output arrays
- Empty input arrays are handled gracefully (empty results)
- Negative inputs to formatOffsetHex are clamped to 0
- All operations are deterministic and cross-platform compatible
