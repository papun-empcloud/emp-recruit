import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Video,
  AlertCircle,
  CircleDot,
  StopCircle,
  CheckCircle,
} from "lucide-react";
import { api, apiGet, apiPost } from "@/api/client";
import { loadJitsiApi, type JitsiApi } from "@/lib/jitsi";
import { startTabRecording, type RecordingController } from "@/lib/interview-recorder";
import { useAuthStore } from "@/lib/auth-store";
import type { Interview } from "@emp-recruit/shared";

type RecState = "idle" | "recording" | "uploading" | "done" | "error";

interface RoomToken {
  token: string;
  roomName: string;
  serverUrl: string;
  domain: string;
  expiresAt: string | null;
  provider: string;
}

// ---------------------------------------------------------------------------
// Embedded interview room — HR/panelists join the meeting inside the app.
// Fetches short-lived join credentials from POST /interviews/:id/meeting-token
// and mounts the Jitsi IFrame API into a full-height container.
// ---------------------------------------------------------------------------
export function InterviewRoomPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const [status, setStatus] = useState<"loading" | "joined" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  // In-browser recording → auto-upload → auto transcript + AI analysis.
  const recorderRef = useRef<RecordingController | null>(null);
  const finishRef = useRef<() => Promise<void>>(async () => {});
  const [rec, setRec] = useState<RecState>("idle");
  const [recMsg, setRecMsg] = useState("");
  // Join is gated behind a click so recording can start within a user gesture
  // (browsers only allow screen capture from a gesture — there's no way to
  // silently auto-start it after the meeting has already loaded).
  const [joinRequested, setJoinRequested] = useState(false);

  const finishRecording = async (): Promise<void> => {
    const controller = recorderRef.current;
    if (!controller) return;
    recorderRef.current = null; // guard against a double stop/upload
    try {
      setRec("uploading");
      const blob = await controller.stop();
      if (!blob || blob.size === 0) {
        setRec("idle");
        return;
      }
      const file = new File([blob], `interview-${id}-${Date.now()}.webm`, {
        type: blob.type || "video/webm",
      });
      const formData = new FormData();
      formData.append("recording", file);
      await api.post(`/interviews/${id}/recordings`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setRec("done");
    } catch {
      setRec("error");
      setRecMsg("Failed to upload the recording.");
    }
  };
  finishRef.current = finishRecording;

  const beginRecording = async (): Promise<void> => {
    setRecMsg("");
    try {
      const controller = await startTabRecording();
      recorderRef.current = controller;
      controller.onExternalStop(() => void finishRecording());
      setRec("recording");
    } catch {
      setRec("idle");
      setRecMsg("Recording didn't start — screen share was cancelled.");
    }
  };

  // Single "Join" gesture: start recording (if requested) inside this click,
  // then mount the meeting. Recording is already capturing before the call
  // appears, so it feels like it auto-starts on join.
  const handleJoin = async (record: boolean): Promise<void> => {
    if (!record) {
      setJoinRequested(true);
      return;
    }
    setRecMsg("");
    try {
      // getDisplayMedia is invoked synchronously inside startTabRecording, so
      // the click's activation is still valid here.
      const controller = await startTabRecording();
      recorderRef.current = controller;
      controller.onExternalStop(() => void finishRecording());
      setRec("recording");
      setJoinRequested(true); // enter the call ONLY once recording is actually live
    } catch (err) {
      // Stay on the pre-join screen — never silently join without recording.
      setRec("idle");
      const name = (err as DOMException)?.name;
      setRecMsg(
        name === "NotAllowedError"
          ? "Screen-share was blocked or dismissed. Click “Join & record” again, choose “This Tab”, and press Share."
          : "Couldn't start recording in this browser. Use Chrome or Edge — or choose “Join without recording”.",
      );
    }
  };

  // Interview title for the header (best-effort; failure doesn't block joining).
  const [title, setTitle] = useState<string>("Interview Room");
  useEffect(() => {
    let active = true;
    apiGet<Interview & { title: string }>(`/interviews/${id}`)
      .then((res) => {
        if (active && res.data?.title) setTitle(res.data.title);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!joinRequested) return;
    let disposed = false;

    async function join() {
      try {
        setStatus("loading");
        const res = await apiPost<RoomToken>(`/interviews/${id}/meeting-token`);
        const room = res.data;
        if (!room) throw new Error("No meeting credentials returned");

        // For JaaS the appId is the first segment of the namespaced room name.
        const appId = room.domain.includes("8x8.vc")
          ? room.roomName.split("/")[0]
          : undefined;
        const JitsiMeetExternalAPI = await loadJitsiApi(room.domain, appId);

        if (disposed || !containerRef.current) return;

        const displayName =
          `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || user?.email || "Interviewer";

        const jitsi = new JitsiMeetExternalAPI(room.domain, {
          roomName: room.roomName,
          jwt: room.token || undefined,
          parentNode: containerRef.current,
          width: "100%",
          height: "100%",
          userInfo: { displayName, email: user?.email },
          configOverwrite: {
            // Our own pre-join screen already gated entry (and started
            // recording), so skip Jitsi's prejoin to avoid a second "join" step.
            prejoinPageEnabled: false,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            disableThirdPartyRequests: true,
          },
          interfaceConfigOverwrite: {
            MOBILE_APP_PROMO: false,
          },
        });

        apiRef.current = jitsi;
        jitsi.addEventListener("videoConferenceJoined", () => {
          if (!disposed) setStatus("joined");
        });
        jitsi.addEventListener("readyToClose", () => {
          // Stop + upload any active recording first, then leave.
          void (async () => {
            await finishRef.current();
            navigate(`/interviews/${id}`);
          })();
        });
        // If the SDK never fires "joined" (e.g. prejoin), still clear the overlay.
        setStatus("joined");
      } catch (err: unknown) {
        if (disposed) return;
        const msg =
          (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
            ?.message ||
          (err as Error)?.message ||
          "Failed to join the interview room.";
        setErrorMsg(msg);
        setStatus("error");
      }
    }

    join();
    return () => {
      disposed = true;
      // Release any active screen capture if the page is torn down mid-call.
      void recorderRef.current?.stop();
      recorderRef.current = null;
      apiRef.current?.dispose();
      apiRef.current = null;
    };
    // user is read once at mount; re-joining on identity change isn't desired.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, navigate, joinRequested]);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] min-h-[480px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/interviews/${id}`)}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Interview
          </button>
          <span className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-gray-900">
            <Video className="h-4 w-4 text-brand-600" /> {title}
          </span>
        </div>

        {/* Recording controls (appear once joined) */}
        {status === "joined" && (
          <div className="flex items-center gap-2 text-sm">
            {rec === "idle" && (
              <button
                onClick={() => void beginRecording()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700"
              >
                <CircleDot className="h-4 w-4" /> Start recording
              </button>
            )}
            {rec === "recording" && (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" /> Recording
                </span>
                <button
                  onClick={() => void finishRecording()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50"
                >
                  <StopCircle className="h-4 w-4" /> Stop &amp; upload
                </button>
              </>
            )}
            {rec === "uploading" && (
              <span className="inline-flex items-center gap-1.5 text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
              </span>
            )}
            {rec === "done" && (
              <span className="inline-flex items-center gap-1.5 text-green-600">
                <CheckCircle className="h-4 w-4" /> Uploaded · analyzing
              </span>
            )}
            {rec === "error" && <span className="text-red-600">{recMsg || "Recording error"}</span>}
          </div>
        )}
      </div>

      {/* Video container */}
      <div className="relative flex-1 overflow-hidden rounded-xl border border-gray-200 bg-gray-900">
        <div ref={containerRef} className="absolute inset-0 h-full w-full" />

        {/* Pre-join gate — one click joins AND starts recording together */}
        {!joinRequested && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-gray-900/95 px-6 text-center text-white">
            <Video className="h-10 w-10 text-brand-400" />
            <div>
              <p className="text-lg font-semibold">Ready to join</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-gray-300">
                Recording starts automatically when you join. When prompted, choose{" "}
                <b>“This Tab”</b> and allow audio so the interview is captured for the transcript
                &amp; AI analysis.
              </p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={() => void handleJoin(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold hover:bg-red-700"
              >
                <CircleDot className="h-4 w-4" /> Join &amp; record interview
              </button>
              <button
                onClick={() => void handleJoin(false)}
                className="text-xs text-gray-400 hover:text-gray-200"
              >
                Join without recording
              </button>
            </div>
            {recMsg && <p className="text-xs text-red-300">{recMsg}</p>}
          </div>
        )}

        {/* Auto-appearing prompt to start recording once in the call */}
        {status === "joined" && rec === "idle" && (
          <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/70 px-4 py-2 text-sm text-white shadow-lg backdrop-blur">
            <span className="hidden sm:inline">
              Record this interview for an automatic transcript &amp; AI analysis
            </span>
            <button
              onClick={() => void beginRecording()}
              className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 font-medium hover:bg-red-700"
            >
              <CircleDot className="h-4 w-4" /> Start
            </button>
          </div>
        )}
        {status === "joined" && rec === "idle" && recMsg && (
          <div className="absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-lg bg-red-900/80 px-3 py-1.5 text-xs text-red-100">
            {recMsg}
          </div>
        )}

        {/* Upload overlay while the finished recording is sent to the server */}
        {rec === "uploading" && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/75 text-white">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="max-w-sm text-center text-sm">
              Uploading recording… the transcript and AI analysis will run automatically.
            </p>
          </div>
        )}

        {joinRequested && status === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-300">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Connecting to the interview room…</p>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <AlertCircle className="h-8 w-8 text-red-400" />
            <p className="text-sm text-red-200 max-w-md">{errorMsg}</p>
            <button
              onClick={() => navigate(`/interviews/${id}`)}
              className="mt-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
            >
              Back to interview
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
