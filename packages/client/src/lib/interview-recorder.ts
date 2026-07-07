// ============================================================================
// In-browser interview recorder
// ============================================================================
// Captures the current tab (the embedded Jitsi conference) via getDisplayMedia
// and records it with MediaRecorder into a webm Blob. The local microphone is
// mixed in when available, since tab audio only carries the *remote*
// participants — this ensures both sides of the interview are captured.
//
// Browser security requires getDisplayMedia to be called from a user gesture,
// so recording is kicked off by a click. After that, everything (stop on
// hang-up, upload, transcription, AI analysis) is automatic.
// ============================================================================

export interface RecordingController {
  /** Stop recording and resolve the captured media (null if nothing recorded). */
  stop(): Promise<Blob | null>;
  /** Register a callback for when the user ends the share via the browser's UI. */
  onExternalStop(cb: () => void): void;
}

function pickMimeType(): string | undefined {
  const prefs = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  for (const m of prefs) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return undefined;
}

/**
 * Start recording the current tab. Prompts the user to pick a screen/tab to
 * share (the browser's mandatory confirmation). Resolves once recording is live.
 * Rejects if the user cancels the picker or denies permission.
 */
export async function startTabRecording(): Promise<RecordingController> {
  // 1) Capture the tab: video + tab audio (the remote participants' voices).
  //    `preferCurrentTab` (Chromium) collapses the picker to a one-click "share
  //    this tab" confirm, but some browsers reject the non-standard hint — fall
  //    back to the standard picker in that case. A real user denial
  //    (NotAllowedError) is rethrown so the caller can report it.
  let display: MediaStream;
  try {
    display = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
      preferCurrentTab: true,
    } as DisplayMediaStreamOptions & { preferCurrentTab: boolean });
  } catch (err) {
    if ((err as DOMException)?.name === "NotAllowedError") throw err;
    display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  }

  // 2) Best-effort: also grab the local mic so the local speaker is captured
  //    (tab audio does not include your own microphone).
  let mic: MediaStream | null = null;
  try {
    mic = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    mic = null;
  }

  // 3) Mix audio sources into one track when we have more than the tab audio.
  const videoTracks = display.getVideoTracks();
  const displayAudio = display.getAudioTracks();
  let audioContext: AudioContext | null = null;
  let audioTracks: MediaStreamTrack[] = displayAudio;

  if (mic) {
    audioContext = new AudioContext();
    const dest = audioContext.createMediaStreamDestination();
    if (displayAudio.length) {
      audioContext.createMediaStreamSource(new MediaStream(displayAudio)).connect(dest);
    }
    audioContext.createMediaStreamSource(mic).connect(dest);
    audioTracks = dest.stream.getAudioTracks();
  }

  const combined = new MediaStream([...videoTracks, ...audioTracks]);

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(combined, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e: BlobEvent) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(2000); // flush a chunk every 2s so long calls don't lose data

  // The user can stop sharing from the browser's native bar — treat as "end".
  let externalStop: (() => void) | null = null;
  const primaryVideo = videoTracks[0];
  if (primaryVideo) {
    primaryVideo.addEventListener("ended", () => externalStop?.());
  }

  const cleanup = () => {
    display.getTracks().forEach((t) => t.stop());
    mic?.getTracks().forEach((t) => t.stop());
    audioContext?.close().catch(() => {});
  };

  return {
    onExternalStop(cb) {
      externalStop = cb;
    },
    stop() {
      return new Promise<Blob | null>((resolve) => {
        const finalize = () => {
          const blob = chunks.length
            ? new Blob(chunks, { type: mimeType?.split(";")[0] || "video/webm" })
            : null;
          cleanup();
          resolve(blob);
        };
        if (recorder.state === "inactive") {
          finalize();
        } else {
          recorder.onstop = finalize;
          recorder.stop();
        }
      });
    },
  };
}
