import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, HelpCircle, ChevronDown, ChevronUp, Download, FileArchive } from 'lucide-react';
import { parseWavPcm16Mono } from '../wav';
import type { ConvertMsg, ResultMsg, ErrorMsg } from '../worker';

const PAL_NOTES = ['C-1', 'C#1', 'D-1', 'D#1', 'E-1', 'F-1', 'F#1', 'G-1', 'G#1', 'A-1', 'A#1', 'B-1',
                   'C-2', 'C#2', 'D-2', 'D#2', 'E-2', 'F-2', 'F#2', 'G-2', 'G#2', 'A-2', 'A#2', 'B-2',
                   'C-3', 'C#3', 'D-3', 'D#3', 'E-3', 'F-3', 'F#3', 'G-3', 'G#3', 'A-3', 'A#3', 'B-3'];

interface FileData {
  id: string;
  file: File;
  name: string;
  size: number;
  sampleRate: number;
  note: string;
  pcm16: Int16Array;
  srcHz: number;
}

interface ConversionResult {
  outputName: string;
  data: Uint8Array;
  segments: Array<{
    label: string;
    note: string;
    targetHz: number;
    startByte: number;
    startOffsetHex: string;
    lengthBytes: number;
    paddedLengthBytes: number;
  }>;
  increment?: string;
  resampler: string;
}

export default function Wav2AmigaWeb() {
  const [files, setFiles] = useState<FileData[]>([]);
  const [mode, setMode] = useState<'single' | 'stacked' | 'stacked-equal'>('stacked');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState('');
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  // Initialize worker
  useEffect(() => {
    workerRef.current = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
    
    workerRef.current.onmessage = (e: MessageEvent<ResultMsg | ErrorMsg>) => {
      if (e.data.type === 'result') {
        const result = e.data;
        setResult({
          outputName: result.filename,
          data: result.output,
          segments: result.report.segments,
          increment: mode === 'stacked-equal' ? 
            (result.report.segments.length > 0 ? 
              (result.report.segments[0].paddedLengthBytes >> 8).toString(16).toUpperCase().padStart(2, '0') : 
              undefined) : 
            undefined,
          resampler: result.report.resampler.name.toUpperCase()
        });
        setIsProcessing(false);
        setProcessingProgress('');
      } else if (e.data.type === 'error') {
        setError(e.data.message);
        setIsProcessing(false);
        setProcessingProgress('');
      }
    };
    
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, [mode]);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };


  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    await addFiles(droppedFiles);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    await addFiles(selectedFiles);
  };

  const addFiles = async (newFiles: File[]) => {
    setError(null);
    const validFiles: FileData[] = [];
    
    for (const file of newFiles) {
      if (!file.name.toLowerCase().endsWith('.wav')) {
        setError(`${file.name}: only WAV files supported`);
        continue;
      }
      
      try {
        const arrayBuffer = await file.arrayBuffer();
        const { pcm16, srcHz } = parseWavPcm16Mono(arrayBuffer, file.name);
        
        validFiles.push({
          id: Math.random().toString(36).substr(2, 9),
          file,
          name: file.name,
          size: file.size,
          sampleRate: srcHz,
          note: 'C-2',
          pcm16,
          srcHz
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : `${file.name}: ${String(err)}`);
      }
    }
    
    setFiles([...files, ...validFiles]);
  };

  const removeFile = (id: string) => {
    setFiles(files.filter(f => f.id !== id));
    setResult(null);
  };

  const updateNote = (id: string, note: string) => {
    setFiles(files.map(f => f.id === id ? { ...f, note } : f));
  };

  const handleConvert = async () => {
    if (files.length === 0) {
      setError('Please add at least one file');
      return;
    }
    
    if (mode === 'single' && files.length > 1) {
      setError('single mode requires exactly 1 input file');
      return;
    }
    
    if (!workerRef.current) {
      setError('Worker not initialized');
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    setResult(null);
    setProcessingProgress('Converting...');
    
    try {
      const convertMsg: ConvertMsg = {
        type: 'convert',
        files: files.map(f => ({
          name: f.name,
          pcm16: f.pcm16,
          srcHz: f.srcHz,
          note: f.note
        })),
        mode
      };
      
      // Transfer ArrayBuffers to avoid copying
      const transferBuffers = files.flatMap(f => [f.pcm16.buffer]);
      workerRef.current.postMessage(convertMsg, transferBuffers);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsProcessing(false);
      setProcessingProgress('');
    }
  };

  const downloadFile = (filename: string, data: Uint8Array) => {
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadReport = () => {
    if (!result) return;
    
    const report = {
      mode,
      outputFile: result.outputName,
      segments: result.segments,
      versions: {
        browser: navigator.userAgent,
        resampler: {
          name: 'zoh',
          version: '1.0.0'
        }
      }
    };
    
    const json = JSON.stringify(report, null, 2);
    const reportFilename = result.outputName.replace('.8SVX', '_report.json');
    downloadFile(reportFilename, new TextEncoder().encode(json));
  };

  const downloadArchive = () => {
    setError('TODO: ZIP support (fflate)');
  };

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-white">wav2amiga</h1>
          <button 
            onClick={() => setShowHelp(true)}
            className="flex items-center gap-2 px-4 py-2 text-gray-300 hover:bg-gray-800 rounded-lg transition"
          >
            <HelpCircle size={20} />
            Help
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-900 border border-red-700 rounded-lg text-red-200">
            {error}
          </div>
        )}

        {/* Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mb-6 p-12 border-2 border-dashed rounded-lg cursor-pointer transition ${
            isDragging 
              ? 'border-blue-400 bg-blue-950' 
              : 'border-gray-700 bg-gray-800 hover:border-gray-600'
          }`}
        >
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <Upload size={48} className={isDragging ? 'text-blue-400' : 'text-gray-500'} />
            <p className="text-lg font-medium">Drop WAV files here or click to browse</p>
            <p className="text-sm">Only WAV PCM16 mono supported</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".wav"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* Mode Selection */}
        <div className="mb-6 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <label className="block text-sm font-medium text-gray-300 mb-3">Mode:</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-gray-300">
              <input
                type="radio"
                value="single"
                checked={mode === 'single'}
                onChange={(e) => setMode(e.target.value)}
                className="w-4 h-4"
              />
              <span>Single</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-gray-300">
              <input
                type="radio"
                value="stacked"
                checked={mode === 'stacked'}
                onChange={(e) => setMode(e.target.value)}
                className="w-4 h-4"
              />
              <span>Stacked</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-gray-300">
              <input
                type="radio"
                value="stacked-equal"
                checked={mode === 'stacked-equal'}
                onChange={(e) => setMode(e.target.value)}
                className="w-4 h-4"
              />
              <span>Stacked Equal</span>
            </label>
          </div>
        </div>

        {/* Files List */}
        {files.length > 0 && (
          <div className="mb-6 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div className="px-4 py-3 bg-gray-700 border-b border-gray-700 font-medium text-gray-300">
              Files
            </div>
            <div className="divide-y divide-gray-700">
              {files.map((file) => (
                <div key={file.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{file.name}</p>
                    <p className="text-sm text-gray-400">
                      {file.sampleRate / 1000}kHz • {formatBytes(file.size)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <select
                      value={file.note}
                      onChange={(e) => updateNote(file.id, e.target.value)}
                      className="px-3 py-1 border border-gray-600 rounded bg-gray-700 text-gray-200 text-sm"
                    >
                      {PAL_NOTES.map(note => (
                        <option key={note} value={note}>{note}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeFile(file.id)}
                      className="p-1 hover:bg-gray-700 rounded transition"
                    >
                      <X size={20} className="text-gray-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Convert Button */}
        <div className="mb-6 flex justify-center">
          <button
            onClick={handleConvert}
            disabled={isProcessing || files.length === 0}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition"
          >
            {isProcessing ? processingProgress : 'Convert'}
          </button>
        </div>

        {/* Results */}
        {result && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div className="px-4 py-3 bg-gray-700 border-b border-gray-700 font-medium text-gray-300">
              Results
            </div>
            <div className="p-4">
              <div className="flex items-start gap-2 mb-4">
                <span className="text-green-400 mt-1">✓</span>
                <div className="flex-1">
                  <p className="font-medium text-white">{result.outputName}</p>
                  <p className="text-sm text-gray-400">
                    {result.segments.length} sample{result.segments.length > 1 ? 's' : ''} • {formatBytes(result.data.length)} • {result.resampler} resampler
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 mb-4 transition"
              >
                {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                Show Details
              </button>

              {showDetails && (
                <div className="mb-4 p-4 bg-gray-700 rounded-lg text-sm">
                  <p className="font-medium text-gray-300 mb-2">Sample Offsets (hex):</p>
                  <ul className="space-y-1 text-gray-400 mb-3">
                    {result.segments.map((segment, i) => (
                      <li key={i}>• {segment.label}: {segment.startOffsetHex}</li>
                    ))}
                  </ul>
                  {result.increment && (
                    <p className="text-gray-400">
                      <span className="font-medium">Increment (Stacked Equal):</span> {result.increment}
                    </p>
                  )}
                  <p className="text-gray-400 mt-2">
                    <span className="font-medium">Resampler:</span> {result.resampler} (deterministic)
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => downloadFile(result.outputName, result.data)}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition"
                >
                  <Download size={16} />
                  Download .8SVX
                </button>
                <button
                  onClick={downloadReport}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition"
                >
                  <Download size={16} />
                  Download Report
                </button>
                <button
                  onClick={downloadArchive}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition"
                >
                  <FileArchive size={16} />
                  Download Archive (.zip)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Help Modal */}
        {showHelp && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto border border-gray-700">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-white">Quick Guide</h2>
                  <button
                    onClick={() => setShowHelp(false)}
                    className="p-1 hover:bg-gray-700 rounded transition"
                  >
                    <X size={24} className="text-gray-400" />
                  </button>
                </div>
                
                <div className="space-y-4 text-gray-300">
                  <section>
                    <h3 className="font-semibold text-lg mb-2 text-white">Supported Files</h3>
                    <p>Only WAV files with PCM16 mono format are supported. This ensures deterministic conversion that matches the CLI output byte-for-byte.</p>
                  </section>
                  
                  <section>
                    <h3 className="font-semibold text-lg mb-2 text-white">Modes</h3>
                    <ul className="list-disc list-inside space-y-1">
                      <li><strong className="text-white">Single:</strong> Convert one file to one 8SVX sample</li>
                      <li><strong className="text-white">Stacked:</strong> Combine multiple files into one 8SVX with consecutive offsets</li>
                      <li><strong className="text-white">Stacked Equal:</strong> Like stacked, but with equal-sized slots for each sample</li>
                    </ul>
                  </section>
                  
                  <section>
                    <h3 className="font-semibold text-lg mb-2 text-white">Note Selection</h3>
                    <p>Choose the Amiga period-based note for each sample. C-2 ≈ 8287 Hz (common ProTracker base note).</p>
                  </section>
                  
                  <section>
                    <h3 className="font-semibold text-lg mb-2 text-white">ZOH Resampler</h3>
                    <p>Uses Zero-Order Hold resampling to preserve transients without interpolation or low-pass filtering, matching Paula chip sample-and-hold behavior.</p>
                  </section>
                  
                  <section>
                    <h3 className="font-semibold text-lg mb-2 text-white">Downloads</h3>
                    <ul className="list-disc list-inside space-y-1">
                      <li><strong className="text-white">.8SVX:</strong> The converted Amiga sample file</li>
                      <li><strong className="text-white">Report:</strong> JSON file with conversion metadata</li>
                      <li><strong className="text-white">Archive:</strong> ZIP containing both files</li>
                    </ul>
                  </section>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}