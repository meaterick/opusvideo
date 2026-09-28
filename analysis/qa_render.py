"""QA for a rendered excerpt: stream info, and audio sync against the song.

The clip's audio is cross-correlated with the song around the expected start
(from the render's --from) so a wrong seek / offset shows up as a lag in ms.
Also dumps frames at given song times for a visual check.

Run:  uv run python qa_render.py ../out/poc.mp4 11.03 [24.58,28.0]
"""
import json
import subprocess
import sys

import numpy as np
import soundfile as sf

import common

clip, t0 = sys.argv[1], float(sys.argv[2])
probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", clip],
                                  capture_output=True, text=True, check=True).stdout)
for s in probe["streams"]:
    if s["codec_type"] == "video":
        print(f"video: {s['codec_name']} {s['width']}x{s['height']} {s['r_frame_rate']} fps, {s.get('nb_frames')} frames, {s['pix_fmt']}")
    else:
        print(f"audio: {s['codec_name']} {s['sample_rate']} Hz {s['channels']} ch")
print(f"duration {float(probe['format']['duration']):.3f} s, {int(probe['format']['size']) / 1e6:.1f} MB")

sr = 8000
wav = common.WORK / "clip_audio.wav"
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", clip, "-vn", "-ac", "1", "-ar", str(sr), str(wav)], check=True)
a, _ = sf.read(wav, dtype="float32")
mix, _ = common.load_mix(44100)
import librosa  # noqa: E402

m = librosa.resample(mix, orig_sr=44100, target_sr=sr)
# compare a 6 s stretch from the middle of the clip (away from the fades)
off = 3.0
seg = a[int(off * sr): int((off + 6) * sr)]
lags = np.arange(-800, 801)  # +-100 ms
base = int((t0 + off) * sr)
c = [np.dot(seg, m[base + l: base + l + len(seg)]) for l in lags]
lag = lags[int(np.argmax(c))] / sr
corr = max(c) / (np.linalg.norm(seg) * np.linalg.norm(m[base: base + len(seg)]) + 1e-9)
print(f"audio sync: clip audio matches song at t0 {lag * 1000:+.1f} ms (normalised correlation {corr:.3f})")
if len(sys.argv) > 3:
    for t in map(float, sys.argv[3].split(",")):
        out = common.QA / f"render_{t:.2f}.png"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t - t0:.3f}", "-i", clip, "-frames:v", "1", str(out)], check=True)
        print(out)
