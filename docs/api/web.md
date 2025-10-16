# Web Application API Reference

## Overview

The Wav2Amiga web application provides a browser-based interface for converting WAV files to Amiga 8SVX format. It runs entirely in the browser using WebAssembly for deterministic resampling.

## Browser Compatibility

### Supported Browsers
- **Chrome**: 90+ (WebAssembly support)
- **Firefox**: 88+ (WebAssembly support)
- **Safari**: 14+ (WebAssembly support)
- **Edge**: 90+ (WebAssembly support)

### Required Features
- WebAssembly support
- File API (FileReader)
- ArrayBuffer support
- ES2020 modules

## Usage

### Basic Interface

1. **Drag and Drop**: Drag WAV files onto the drop zone
2. **File Selection**: Click to browse and select files
3. **Mode Selection**: Choose conversion mode (Single, Stacked, StackedEqual)
4. **Note Configuration**: Set ProTracker notes for each file
5. **Convert**: Click convert button to process files
6. **Download**: Download the generated .8SVX file

### Conversion Modes

#### Single Mode
- One .8SVX file per input sample
- Requires one note for all files
- Best for individual sample conversion

#### Stacked Mode
- Concatenates all samples into one file
- Each sample can have different notes
- Creates sequential segments with individual alignment

#### StackedEqual Mode
- Concatenates all samples into one file
- All segments padded to equal size
- Creates uniform slots for predictable ProTracker offsets

## API for Embedding

### Core Functions

#### `convertAudio(files, options)`
Converts audio files in the browser.

**Parameters:**
```typescript
interface ConvertOptions {
  mode: 'single' | 'stacked' | 'stacked-equal';
  notes: string[];           // Array of notes, one per file
  emitReport?: boolean;      // Generate JSON report
}
```

**Returns:**
```typescript
interface ConvertResult {
  outputBytes: Uint8Array;
  filename: string;
  report?: object;
  segments: SegmentInfo[];
}
```

**Example:**
```javascript
import { convertAudio } from './wav.js';

const files = [file1, file2]; // File objects
const result = await convertAudio(files, {
  mode: 'stacked',
  notes: ['C-2', 'D-2'],
  emitReport: true
});

// Download the result
const blob = new Blob([result.outputBytes], { type: 'application/octet-stream' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = result.filename;
a.click();
```

#### `validateFile(file)`
Validates a file for conversion.

**Parameters:**
- `file`: File object

**Returns:**
```typescript
interface ValidationResult {
  valid: boolean;
  error?: string;
  channels?: number;
  sampleRate?: number;
  duration?: number;
}
```

**Example:**
```javascript
import { validateFile } from './wav.js';

const result = validateFile(file);
if (!result.valid) {
  console.error('Invalid file:', result.error);
}
```

### Event Handling

#### File Drop Events
```javascript
const dropZone = document.getElementById('drop-zone');

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  
  const files = Array.from(e.dataTransfer.files);
  const wavFiles = files.filter(file => file.name.toLowerCase().endsWith('.wav'));
  
  // Process files
  for (const file of wavFiles) {
    const result = await convertAudio([file], {
      mode: 'single',
      notes: ['C-2']
    });
    // Handle result
  }
});
```

#### Progress Events
```javascript
import { convertAudio } from './wav.js';

const result = await convertAudio(files, options, {
  onProgress: (progress) => {
    console.log(`Progress: ${progress.percent}%`);
    updateProgressBar(progress.percent);
  }
});
```

## Configuration

### Resampler Options

#### ZOH Resampler (Default)
- Zero-order hold resampling
- Preserves transients and sharp attacks
- Deterministic output
- Fast processing

#### WebAudio Fallback
- Used when WebAssembly fails to load
- Non-deterministic across browsers
- Labeled as "Preview Quality"
- Faster loading

### Performance Settings

#### Memory Management
```javascript
// Configure memory limits
const config = {
  maxFileSize: 50 * 1024 * 1024,  // 50MB
  maxFiles: 10,
  chunkSize: 1024 * 1024          // 1MB chunks
};
```

#### Worker Configuration
```javascript
// Use Web Worker for large files
const useWorker = file.size > 10 * 1024 * 1024; // 10MB threshold
```

## Error Handling

### File Validation Errors
```javascript
try {
  const result = await convertAudio(files, options);
} catch (error) {
  if (error.code === 'INVALID_FILE') {
    console.error('Invalid file format:', error.message);
  } else if (error.code === 'NON_MONO') {
    console.error('File must be mono:', error.message);
  } else if (error.code === 'EMPTY_AUDIO') {
    console.error('File contains no audio data:', error.message);
  }
}
```

### WebAssembly Errors
```javascript
try {
  const result = await convertAudio(files, options);
} catch (error) {
  if (error.code === 'WASM_LOAD_FAILED') {
    console.warn('WebAssembly failed to load, using fallback');
    // Fallback to WebAudio
  }
}
```

## UI Components

### File Drop Zone
```html
<div id="drop-zone" class="drop-zone">
  <p>Drag and drop WAV files here</p>
  <input type="file" multiple accept=".wav" />
</div>
```

### Mode Selection
```html
<select id="mode-select">
  <option value="single">Single</option>
  <option value="stacked">Stacked</option>
  <option value="stacked-equal">StackedEqual</option>
</select>
```

### Note Configuration
```html
<div id="note-config">
  <div class="file-note" data-file="0">
    <label>kick.wav</label>
    <select>
      <option value="C-2">C-2</option>
      <option value="D-2">D-2</option>
      <!-- ... more notes ... -->
    </select>
  </div>
</div>
```

### Progress Display
```html
<div id="progress">
  <div class="progress-bar">
    <div class="progress-fill" style="width: 0%"></div>
  </div>
  <span class="progress-text">Ready</span>
</div>
```

## Styling

### CSS Classes
```css
.drop-zone {
  border: 2px dashed #ccc;
  padding: 20px;
  text-align: center;
  transition: border-color 0.3s;
}

.drop-zone.drag-over {
  border-color: #007bff;
  background-color: #f8f9fa;
}

.progress-bar {
  width: 100%;
  height: 20px;
  background-color: #e9ecef;
  border-radius: 10px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background-color: #007bff;
  transition: width 0.3s;
}
```

## Performance Optimization

### File Processing
- Process files in chunks to avoid blocking UI
- Use Web Workers for large files
- Implement progress callbacks for user feedback

### Memory Management
- Release ArrayBuffers after processing
- Limit concurrent file processing
- Implement file size limits

### Caching
- Cache WebAssembly module
- Cache resampler instances
- Implement result caching for repeated conversions

## Security Considerations

### File Validation
- Validate file types before processing
- Check file size limits
- Sanitize filenames for downloads

### Content Security Policy
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' 'wasm-unsafe-eval'; 
               worker-src 'self' blob:;">
```

## Troubleshooting

### Common Issues

#### WebAssembly Not Loading
- Check browser compatibility
- Verify Content Security Policy
- Check console for loading errors

#### File Processing Fails
- Verify file is valid WAV format
- Check file is mono channel
- Ensure file is not corrupted

#### Performance Issues
- Reduce file size or number of files
- Check available memory
- Use Web Workers for large files

### Debug Mode
```javascript
// Enable debug logging
localStorage.setItem('wav2amiga-debug', 'true');

// Check debug output in console
console.log('Debug mode enabled');
```
