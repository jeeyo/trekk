/**
 * Fallback for browsers that can't encode H.264 with WebCodecs: we encode VP9 with WebCodecs
 * first (fast), then transcode to H.264/AAC-free MP4 with ffmpeg.wasm (libx264) so Instagram
 * accepts it. Loaded lazily; the multi-threaded core is used when the page is cross-origin isolated.
 */
import { FFmpeg } from '@ffmpeg/ffmpeg';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
import mtCoreURL from '@ffmpeg/core-mt?url';
import mtWasmURL from '@ffmpeg/core-mt/wasm?url';
import mtWorkerURL from '@ffmpeg/core-mt/worker?url';

export async function transcodeToH264(
  input: Uint8Array,
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<Uint8Array> {
  const ff = new FFmpeg();
  ff.on('progress', ({ progress }) => opts.onProgress?.(Math.max(0, Math.min(1, progress))));
  const abort = () => ff.terminate();
  opts.signal?.addEventListener('abort', abort);
  try {
    // Threads need SharedArrayBuffer, i.e. a cross-origin isolated page (our COOP/COEP headers).
    const threads = globalThis.crossOriginIsolated && (navigator.hardwareConcurrency ?? 1) > 1;
    await ff.load(
      threads
        ? { coreURL: mtCoreURL, wasmURL: mtWasmURL, workerURL: mtWorkerURL }
        : { coreURL, wasmURL },
    );
    await ff.writeFile('in.mp4', input);
    const code = await ff.exec([
      '-i',
      'in.mp4',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '19',
      '-pix_fmt',
      'yuv420p',
      '-profile:v',
      'high',
      '-movflags',
      '+faststart',
      ...(globalThis.crossOriginIsolated
        ? ['-threads', String(Math.min(8, navigator.hardwareConcurrency ?? 2))]
        : []),
      '-an',
      'out.mp4',
    ]);
    if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
    const data = await ff.readFile('out.mp4');
    if (typeof data === 'string') throw new Error('unexpected ffmpeg output');
    return data;
  } finally {
    opts.signal?.removeEventListener('abort', abort);
    ff.terminate();
  }
}
