# Walkthrough videos — source files

Narration scripts (`*-script.md`, `sections/*.txt`), narration MP3s, frames and
stills live here. The large intermediate **WAV** renders (~89 MB) were removed
from git on 2026-11-21 — each one has an MP3 next to it and can be rebuilt:

```bash
# per-section 48 kHz WAVs
for f in sections/*.mp3; do ffmpeg -y -i "$f" -ar 48000 "${f%.mp3}-48k.wav"; done
# full-length tracks
ffmpeg -y -i coach-walkthrough-narration.mp3 -ar 48000 coach-audio.wav
ffmpeg -y -i player-walkthrough-narration.mp3 -ar 48000 player-audio.wav
```

`*.wav` is gitignored so they don't come back. Note: `coach-video-only.mp4`
is a 48-byte stub (the render never finished).
