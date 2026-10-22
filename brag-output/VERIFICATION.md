# Delivery verification

- brag.mp4: 22.0 seconds, 1920×1080, 30 fps, 660 frames, H.264 yuv420p with AAC audio.
- Final HyperFrames check passed with browser enabled: zero runtime, layout, motion or contrast errors. 109 contrast checks, 300 motion samples across eight assertions.
- One reviewed lint warning: the same WheelSense logo image appears in four scenes. Decoded frames confirm the intended logo in each scene.
- Visually inspected all settled scenes, acknowledgement, and decoded MP4 frames at frame zero, the cursor press and the outro.
- Full MP4 decoded through FFmpeg without errors. Audio is present, with no clipping.
- Poster selected from the settled opening at 2.0 seconds, extracted as brag.jpg and baked into frame zero. Dimensions, duration, frame count and audio presence verified before replacing the raw encode.
- Source-based interface reconstruction with fictional demo data. No clinical performance or outcome claims, publishing or live patient sessions.
- MemPalace tools and Python module unavailable; no memory query or diary write claimed.
- Product code untouched. Deliverables are under brag-output/.

## Audio measurements
- mean_volume: -28.5 dB
- max_volume: -4.2 dB

## Re-render
Put tools/ffmpeg-9.0.2-essentials_build/bin on PATH, then run the pinned npm run check and npm run render from composition/. Final handoff is brag.mp4; index.html is editable source.

HyperFrames 0.8.181 used screenshot capture with hardware GPU. Chrome Headless Shell 152.0.7977.30, NVIDIA RTX 5070 Laptop. Capture 26.3s, encode 8.4s, total 39.6s before poster processing.
