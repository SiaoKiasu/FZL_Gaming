// Browser-side video preparation: shrink a raw clip to roughly 1080p and a
// few MB, and grab a poster frame off it. Runs entirely in the uploader's
// tab -- nothing here is server code.
//
// Why this exists at all: ShadowPlay records 1080p60 at ~50 Mbps, so a
// 15-second highlight lands around 90 MB. Sending that to COS would be
// slow to upload, slow to play back over a mainland connection, and would
// cost roughly 15x more in transfer than it needs to. Re-encoding to ~3
// Mbps brings the same clip to about 5 MB with no visible loss at this
// length.
//
// The mechanism is deliberately dependency-free: play the clip into a
// canvas, capture the canvas as a MediaStream, and let MediaRecorder
// re-encode it. ffmpeg.wasm would give finer control but costs a ~25 MB
// download before the first byte is encoded -- absurd for 10-second clips.
// A side effect of going through a canvas is that the audio track is
// dropped, which is what we want anyway.
//
// The cost of this approach: encoding happens in real time, because the
// clip has to actually play. For the 10-20 second clips this feature is
// for, that's fine. It also means the tab must stay in the foreground --
// browsers throttle rAF in background tabs -- hence the warning in the
// upload form.

export type TranscodeResult = {
  blob: Blob;
  ext: "mp4" | "webm";
  mimeType: string;
  width: number;
  height: number;
  durationSec: number;
  poster: Blob | null;
  /** True when the original was already small enough to send untouched. */
  skipped: boolean;
  /** Bitrate actually handed to the encoder, in bits per second. */
  bitrate: number;
};

export type ProgressFn = (phase: string, ratio: number) => void;

/**
 * Overrides for the defaults below. The upload form passes nothing and gets
 * the tuned values; the quality bench at /videos/quality sweeps them so the
 * numbers can be chosen by looking at real footage rather than guessed.
 */
export type TranscodeOptions = {
  maxHeight?: number;
  /** Bits per second handed to the encoder. */
  bitrate?: number;
  /** Re-encode even when the original would normally be passed through. */
  force?: boolean;
};

const MAX_HEIGHT = 1080;

// Fixed bitrate, chosen by watching real footage on /videos/quality. 3.6
// Mbps was the first value that looked right; 2 Mbps turned out to hold up
// just as well on this kind of gameplay capture, at a bit over half the
// size, so that's what shipped.
//
// This used to derive the bitrate from a target file size, which meant
// quality silently fell off a cliff as clips got longer -- the same 5.5 MB
// budget spread over 60 seconds is only 1.33 Mbps, visibly mushy on a
// 1080p teamfight. Holding the bitrate steady instead lets file size grow
// with duration, which is the honest trade: a longer clip really does
// carry more information.
const TARGET_BITRATE = 2_000_000;

// Passing a file through untouched is decided by comparing bitrates, not
// file sizes. A fixed byte threshold can't tell the two cases apart: 7 MB
// of 5-second footage is 11 Mbps and worth re-encoding, while 7 MB of
// 60-second footage is 0.93 Mbps and re-encoding it would make the file
// BIGGER while also making it look worse. The 10% margin avoids burning a
// minute of someone's time to shave a rounding error.
const SKIP_BITRATE_MARGIN = 1.1;

// Only consulted when the duration can't be read, which is the one case
// where a bitrate can't be computed. Set at roughly what TARGET_BITRATE
// produces for a ~22s clip -- the length this feature is actually for.
const SKIP_TRANSCODE_BYTES = 6 * 1024 * 1024;

// Hard ceiling on what may be uploaded without re-encoding, for the case
// where the browser can't record at all.
const HARD_MAX_BYTES = 200 * 1024 * 1024;

// Ordered by preference. mp4/H.264 first: it is the only container that
// plays everywhere, and notably iOS Safari's webm support is patchy.
const MIME_CANDIDATES: ReadonlyArray<{ mimeType: string; ext: "mp4" | "webm" }> = [
  { mimeType: "video/mp4;codecs=avc1.4d002a", ext: "mp4" },
  { mimeType: "video/mp4;codecs=avc1", ext: "mp4" },
  { mimeType: "video/mp4", ext: "mp4" },
  { mimeType: "video/webm;codecs=vp9", ext: "webm" },
  { mimeType: "video/webm;codecs=vp8", ext: "webm" },
  { mimeType: "video/webm", ext: "webm" },
];

function pickMimeType(): { mimeType: string; ext: "mp4" | "webm" } | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const candidate of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate.mimeType)) return candidate;
  }
  return null;
}

// requestVideoFrameCallback fires once per decoded frame, which keeps the
// canvas in step with the video instead of with the display's refresh
// rate. It isn't in lib.dom yet, so it's reached through this narrow cast
// rather than by widening the global HTMLVideoElement type.
type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
};

function onNextFrame(video: HTMLVideoElement, cb: () => void): void {
  const rvfc = (video as VideoWithFrameCallback).requestVideoFrameCallback;
  if (typeof rvfc === "function") {
    rvfc.call(video, cb);
  } else {
    requestAnimationFrame(() => cb());
  }
}

function loadVideo(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    // Required for play() to be allowed without a user gesture on iOS.
    video.playsInline = true;
    video.src = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      // A stream-copied recording can report Infinity until it has been
      // seeked to the end at least once.
      if (!Number.isFinite(video.duration)) {
        video.onseeked = () => {
          video.onseeked = null;
          resolve(video);
        };
        video.currentTime = 1e9;
        return;
      }
      resolve(video);
    };
    video.onerror = () =>
      reject(new Error("这个视频浏览器读不了，试试先用剪辑软件导出成 mp4"));
  });
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const handler = () => {
      video.removeEventListener("seeked", handler);
      resolve();
    };
    video.addEventListener("seeked", handler);
    video.currentTime = time;
  });
}

// Scaled-down dimensions, both forced even: odd dimensions are rejected
// outright by some H.264 encoders.
function fitDimensions(
  width: number,
  height: number,
  maxHeight: number
): { w: number; h: number } {
  const scale = Math.min(1, maxHeight / height);
  const w = Math.max(2, Math.round((width * scale) / 2) * 2);
  const h = Math.max(2, Math.round((height * scale) / 2) * 2);
  return { w, h };
}

async function capturePoster(
  video: HTMLVideoElement,
  w: number,
  h: number
): Promise<Blob | null> {
  // A frame from the middle is far more representative than the first one,
  // which in game footage is often a black fade-in.
  const at = Number.isFinite(video.duration) ? video.duration / 2 : 0;
  await seek(video, Math.max(0, Math.min(at, video.duration - 0.05)));

  const scale = Math.min(1, 1280 / w);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(w * scale));
  canvas.height = Math.max(2, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.75);
  });
}

async function record(
  video: HTMLVideoElement,
  w: number,
  h: number,
  mimeType: string,
  bitrate: number,
  onProgress?: ProgressFn
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器不支持 canvas，没法压缩");

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: bitrate,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error("压缩过程出错了"));
  });

  await seek(video, 0);
  recorder.start(250);

  const duration = video.duration;
  await new Promise<void>((resolve, reject) => {
    const drawFrame = () => {
      if (video.ended) {
        resolve();
        return;
      }
      ctx.drawImage(video, 0, 0, w, h);
      onProgress?.("压缩中", duration > 0 ? video.currentTime / duration : 0);
      onNextFrame(video, drawFrame);
    };
    video.onended = () => resolve();
    video.onerror = () => reject(new Error("压缩过程中视频读取失败"));
    video.play().then(
      () => onNextFrame(video, drawFrame),
      () => reject(new Error("浏览器不让自动播放，没法压缩"))
    );
  });

  // Let the encoder drain the last frames before cutting it off, otherwise
  // the tail of the clip is sometimes missing.
  await new Promise((resolve) => setTimeout(resolve, 250));
  recorder.stop();
  await stopped;

  const blob = new Blob(chunks, { type: mimeType });
  if (blob.size === 0) throw new Error("压缩出来是空文件，换个视频试试");
  return blob;
}

export async function prepareVideo(
  file: File,
  onProgress?: ProgressFn,
  options?: TranscodeOptions
): Promise<TranscodeResult> {
  const maxHeight = options?.maxHeight ?? MAX_HEIGHT;
  const bitrate = options?.bitrate ?? TARGET_BITRATE;
  if (file.size > HARD_MAX_BYTES) {
    throw new Error("文件超过 200MB，先用剪辑软件导出小一点的版本");
  }

  onProgress?.("读取视频", 0);
  const video = await loadVideo(file);
  const durationSec = Number.isFinite(video.duration) ? video.duration : 0;
  const { w, h } = fitDimensions(video.videoWidth, video.videoHeight, maxHeight);

  onProgress?.("生成封面", 0);
  const poster = await capturePoster(video, video.videoWidth, video.videoHeight);

  // Already mp4, already no bigger than 1080p, and already at or below the
  // bitrate we'd encode to: re-encoding would cost the uploader real time
  // and produce a file that is bigger, blurrier, or both.
  const sourceBitrate = durationSec > 0 ? (file.size * 8) / durationSec : 0;
  const alreadySmallEnough =
    sourceBitrate > 0
      ? sourceBitrate <= bitrate * SKIP_BITRATE_MARGIN
      : file.size <= SKIP_TRANSCODE_BYTES;
  const alreadyFine =
    !options?.force &&
    file.type === "video/mp4" &&
    alreadySmallEnough &&
    video.videoHeight <= maxHeight;

  const target = pickMimeType();

  if (alreadyFine || !target) {
    if (!target && file.type !== "video/mp4") {
      throw new Error(
        "这个浏览器不支持在网页里压缩视频，请先自己导出成 mp4 再上传"
      );
    }
    URL.revokeObjectURL(video.src);
    return {
      blob: file,
      ext: "mp4",
      mimeType: "video/mp4",
      width: video.videoWidth,
      height: video.videoHeight,
      durationSec,
      poster,
      skipped: true,
      bitrate: Math.round(sourceBitrate),
    };
  }

  const blob = await record(video, w, h, target.mimeType, bitrate, onProgress);
  URL.revokeObjectURL(video.src);

  return {
    blob,
    ext: target.ext,
    mimeType: target.mimeType,
    width: w,
    height: h,
    durationSec,
    poster,
    skipped: false,
    bitrate,
  };
}
