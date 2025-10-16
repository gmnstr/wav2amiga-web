# Conversion Modes

## Overview

Wav2Amiga supports three conversion modes, each designed for different use cases in Amiga music production. Understanding these modes is crucial for creating the right output format for your needs.

## Single Mode

### Purpose
Creates one `.8SVX` file per input sample. Each file is independent and can be loaded separately in ProTracker.

### Use Cases
- Individual sample conversion
- Building a sample library
- Testing different notes for the same sample
- Creating samples for different instruments

### Command
```bash
wav2amiga --mode single --note C-2 input.wav
```

### Output
- **Files**: One `.8SVX` file per input
- **Naming**: `{input_basename}.8SVX`
- **Content**: Single resampled and aligned segment

### Example
```bash
# Convert three samples individually
wav2amiga --mode single --note C-2 kick.wav    # Creates kick.8SVX
wav2amiga --mode single --note D-2 snare.wav   # Creates snare.8SVX
wav2amiga --mode single --note F#3 hat.wav     # Creates hat.8SVX
```

## Stacked Mode

### Purpose
Concatenates multiple samples into a single `.8SVX` file with individual alignment. Each segment starts at a different offset, allowing access via ProTracker's `9xx` commands.

### Use Cases
- Creating drum kits with multiple samples
- Building sample banks for efficient loading
- Creating layered sounds with different pitches
- Organizing related samples together

### Command
```bash
# All samples with same note
wav2amiga --mode stacked --note C-2 kick.wav snare.wav hat.wav

# Different notes per sample
wav2amiga --mode stacked --manifest drumkit.json
```

### Output
- **Files**: One `.8SVX` file containing all segments
- **Naming**: `{first_input_basename}_{offset1}_{offset2}_..._{offsetN}.8SVX`
- **Content**: Multiple segments with individual 0x100-byte alignment

### Alignment and Offsets
Each segment is padded to the next 256-byte boundary:

```
Segment 1: 1200 bytes → 1280 bytes (0x500) → offset 05
Segment 2: 800 bytes  → 1024 bytes (0x400) → offset 04  
Segment 3: 400 bytes  → 512 bytes  (0x200) → offset 02
```

**Filename**: `kit_05_09_0D.8SVX` (offsets: 05, 09, 0D)

### ProTracker Usage
Load the file in ProTracker and use `9xx` commands:
- `905`: Play segment 1 (kick)
- `909`: Play segment 2 (snare)  
- `90D`: Play segment 3 (hat)

### Example
```bash
# Create a drum kit
echo '[
  {"filepath": "kick.wav", "note": "C-2"},
  {"filepath": "snare.wav", "note": "D-2"},
  {"filepath": "hat.wav", "note": "F#3"}
]' > drumkit.json

wav2amiga --mode stacked --manifest drumkit.json
# Creates: kick_05_09_0D.8SVX
```

## StackedEqual Mode

### Purpose
Concatenates multiple samples into a single `.8SVX` file with uniform slot sizes. All segments are padded to the same size, creating predictable offset spacing.

### Use Cases
- Creating drum kits with uniform spacing
- Building sample banks with consistent offsets
- Creating layered sounds with equal slot sizes
- Organizing samples for predictable pattern programming

### Command
```bash
# All samples with same note
wav2amiga --mode stacked-equal --note C-2 kick.wav snare.wav hat.wav

# Different notes per sample
wav2amiga --mode stacked-equal --manifest drumkit.json
```

### Output
- **Files**: One `.8SVX` file containing all segments
- **Naming**: `{first_input_basename}_{increment}.8SVX`
- **Content**: Multiple segments with uniform slot sizes

### Uniform Slot Calculation
All segments are padded to match the largest segment's aligned size:

```
Segment 1: 1200 bytes → 1280 bytes (0x500) → largest
Segment 2: 800 bytes  → 1280 bytes (0x500) → padded to match
Segment 3: 400 bytes  → 1280 bytes (0x500) → padded to match

Increment: 0x500 >> 8 = 05
```

**Filename**: `kit_05.8SVX` (increment: 05)

### ProTracker Usage
Load the file in ProTracker and use predictable `9xx` commands:
- `900`: Play segment 1 (kick)
- `905`: Play segment 2 (snare) - exactly 5 slots later
- `90A`: Play segment 3 (hat) - exactly 10 slots later

### Offset Calculation
For segment index `n`: `offset = base + (n × increment)`
- Segment 0: `900` (base)
- Segment 1: `905` (base + 1×5)
- Segment 2: `90A` (base + 2×5)

### Example
```bash
# Create a uniform drum kit
wav2amiga --mode stacked-equal --note C-2 kick.wav snare.wav hat.wav
# Creates: kick_05.8SVX

# In ProTracker patterns:
# 900 C-2 01 00  # Play kick
# 905 D-2 01 00  # Play snare (5 slots later)
# 90A F#3 01 00  # Play hat (10 slots later)
```

## Mode Comparison

| Feature | Single | Stacked | StackedEqual |
|---------|--------|---------|--------------|
| **Files Created** | One per input | One total | One total |
| **Alignment** | Individual | Individual | Uniform |
| **Offset Spacing** | N/A | Variable | Predictable |
| **Use Case** | Sample library | Drum kit | Uniform kit |
| **ProTracker Access** | Direct load | 9xx commands | 9xx commands |
| **File Size** | Smallest | Medium | Largest |

## Choosing the Right Mode

### Use Single Mode When:
- Building a sample library
- Testing different notes for the same sample
- Creating samples for different instruments
- You want maximum flexibility

### Use Stacked Mode When:
- Creating drum kits with different sample sizes
- You want to minimize file size
- You don't need predictable offset spacing
- You're comfortable with variable 9xx commands

### Use StackedEqual Mode When:
- Creating drum kits with uniform spacing
- You want predictable offset calculations
- You're building patterns with consistent spacing
- File size is not a concern

## Advanced Usage

### Mixed Note Configuration
```bash
# Stacked mode with different notes
echo '[
  {"filepath": "kick.wav", "note": "C-2"},
  {"filepath": "snare.wav", "note": "D-2"},
  {"filepath": "hat.wav", "note": "F#3"},
  {"filepath": "crash.wav", "note": "A#3"}
]' > kit.json

wav2amiga --mode stacked --manifest kit.json
```

### Batch Processing
```bash
# Convert multiple files in different modes
for file in kicks/*.wav; do
  wav2amiga --mode single --note C-2 "$file"
done

for file in snares/*.wav; do
  wav2amiga --mode single --note D-2 "$file"
done

# Create a master kit
wav2amiga --mode stacked-equal --manifest master-kit.json
```

### Report Generation
```bash
# Generate detailed reports for analysis
wav2amiga --mode stacked --manifest kit.json --emit-report

# Check the generated report.json for:
# - Segment offsets
# - File sizes
# - Alignment information
# - ProTracker compatibility
```

## ProTracker Integration Tips

### Loading Samples
1. Load the `.8SVX` file in ProTracker
2. The sample will be automatically detected
3. Use the specified note for proper playback speed
4. For stacked files, use `9xx` commands to access segments

### Pattern Programming
```bash
# For StackedEqual mode with increment 05:
# 900 C-2 01 00  # Kick
# 905 D-2 01 00  # Snare  
# 90A F#3 01 00  # Hat
# 90F A#3 01 00  # Crash
```

### Offset Reference
Keep a reference of your sample offsets:
- `900`: Kick (segment 0)
- `905`: Snare (segment 1)
- `90A`: Hat (segment 2)
- `90F`: Crash (segment 3)

This makes pattern programming much easier and more predictable.
