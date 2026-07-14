#!/usr/bin/env bash
# Start a per-user PulseAudio server, then run the bot. The virtual audio
# devices themselves are created by the app (src/audio.ts) once Pulse is up.
set -e

mkdir -p "${XDG_RUNTIME_DIR:-/tmp/runtime-bot}"
pulseaudio --start --exit-idle-time=-1 --disallow-exit --log-target=stderr || true

# Give Pulse a moment to come up before the app loads its modules.
sleep 1

exec npm start
