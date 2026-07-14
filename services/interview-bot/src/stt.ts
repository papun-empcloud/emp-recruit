// Streaming speech-to-text via Deepgram's live WebSocket API. We push raw
// 16-bit PCM (16 kHz mono) captured from the meeting audio and receive final
// transcripts plus an "UtteranceEnd" event we use for turn-taking.
// Docs: https://developers.deepgram.com/docs/live-streaming-audio

import WebSocket from "ws";
import { config } from "./config.js";

export interface SttSession {
  ready: Promise<void>;
  onFinal(cb: (text: string) => void): void;
  onUtteranceEnd(cb: () => void): void;
  send(pcm: Buffer): void;
  close(): void;
}

export function openDeepgram(): SttSession {
  const params = new URLSearchParams({
    encoding: "linear16",
    sample_rate: String(config.deepgram.sampleRate),
    channels: "1",
    model: config.deepgram.model,
    punctuate: "true",
    interim_results: "true",
    vad_events: "true",
    endpointing: String(config.deepgram.endpointingMs),
    utterance_end_ms: String(config.deepgram.utteranceEndMs),
  });

  const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, {
    headers: { Authorization: `Token ${config.deepgram.apiKey}` },
  });

  const finalCbs: Array<(t: string) => void> = [];
  const endCbs: Array<() => void> = [];
  const queue: Buffer[] = [];
  let open = false;

  const ready = new Promise<void>((resolve, reject) => {
    ws.on("open", () => {
      open = true;
      for (const chunk of queue) ws.send(chunk);
      queue.length = 0;
      resolve();
    });
    ws.on("error", reject);
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "Results") {
        const alt = msg.channel?.alternatives?.[0];
        if (alt?.transcript && msg.is_final) {
          finalCbs.forEach((cb) => cb(alt.transcript as string));
        }
      } else if (msg.type === "UtteranceEnd") {
        endCbs.forEach((cb) => cb());
      }
    } catch {
      /* ignore non-JSON keepalives */
    }
  });

  return {
    ready,
    onFinal: (cb) => finalCbs.push(cb),
    onUtteranceEnd: (cb) => endCbs.push(cb),
    send: (pcm) => {
      if (open && ws.readyState === WebSocket.OPEN) ws.send(pcm);
      else queue.push(pcm);
    },
    close: () => {
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "CloseStream" }));
        ws.close();
      } catch {
        /* ignore */
      }
    },
  };
}
