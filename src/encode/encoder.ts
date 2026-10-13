import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  canEncodeVideo,
  type VideoCodec,
} from 'mediabunny';

export interface FrameSink {
  /** codec actually used by WebCodecs */
  codec: VideoCodec;
  /** true when the result still needs transcoding to H.264 */
  needsTranscode: boolean;
  add(timestamp: number, duration: number, keyFrame: boolean): Promise<void>;
  finish(): Promise<Uint8Array>;
  cancel(): Promise<void>;
}

/** Pick H.264 when the device can encode it; otherwise a high-quality intermediate. */
export async function pickCodec(
  width: number,
  height: number,
): Promise<{ codec: VideoCodec; needsTranscode: boolean } | undefined> {
  if (typeof VideoEncoder === 'undefined') return undefined;
  const bitrate = 12e6;
  if (await canEncodeVideo('avc', { width, height, bitrate }))
    return { codec: 'avc', needsTranscode: false };
  for (const codec of ['vp9', 'av1', 'vp8'] as const) {
    if (await canEncodeVideo(codec, { width, height, bitrate }))
      return { codec, needsTranscode: true };
  }
  return undefined;
}

export async function createSink(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opts: { codec: VideoCodec; needsTranscode: boolean; fps: number },
): Promise<FrameSink> {
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const source = new CanvasSource(canvas, {
    codec: opts.codec,
    // Intermediate gets extra bitrate so the second-generation H.264 stays clean.
    bitrate: opts.needsTranscode ? 24e6 : 12e6,
    keyFrameInterval: 2,
  });
  output.addVideoTrack(source, { frameRate: opts.fps });
  await output.start();
  return {
    codec: opts.codec,
    needsTranscode: opts.needsTranscode,
    add: (ts, dur, keyFrame) => source.add(ts, dur, keyFrame ? { keyFrame: true } : undefined),
    async finish() {
      await output.finalize();
      return new Uint8Array(target.buffer!);
    },
    cancel: () => output.cancel(),
  };
}
