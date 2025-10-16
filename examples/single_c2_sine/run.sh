#!/bin/bash
set -e

echo "Running single C-2 sine example..."

# Check if CLI is available
if ! command -v wav2amiga &> /dev/null; then
    echo "Error: wav2amiga CLI not found. Please build the project first."
    echo "Run: pnpm build"
    exit 1
fi

# Convert the input file
wav2amiga --mode single --note C-2 input.wav

# Verify output exists
if [ ! -f "output.8SVX" ]; then
    echo "Error: output.8SVX not created"
    exit 1
fi

# Check if expected file exists for comparison
if [ -f "expected.8SVX" ]; then
    # Compare SHA256 checksums
    ACTUAL_SHA=$(shasum -a 256 output.8SVX | cut -d' ' -f1)
    EXPECTED_SHA=$(shasum -a 256 expected.8SVX | cut -d' ' -f1)
    
    if [ "$ACTUAL_SHA" = "$EXPECTED_SHA" ]; then
        echo "✅ SHA256 checksum matches: $ACTUAL_SHA"
    else
        echo "❌ SHA256 checksum mismatch:"
        echo "  Expected: $EXPECTED_SHA"
        echo "  Actual:   $ACTUAL_SHA"
        exit 1
    fi
else
    echo "⚠️  No expected.8SVX file found for comparison"
    echo "Generated output.8SVX with SHA256: $(shasum -a 256 output.8SVX | cut -d' ' -f1)"
fi

echo "✅ Single C-2 sine example completed successfully"
