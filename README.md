# Frame — AI Video Enhancer MVP

Russian-language web UI and browser player with an optional server-side video enhancement pipeline powered by **Real-ESRGAN**.

## Run the web app

Requires Python 3.11+, FFmpeg/ffprobe, and a Real-ESRGAN NCNN Vulkan executable plus its model files.

1. Install Python dependencies: `python -m pip install -r requirements.txt`
2. Install `ffmpeg` and `ffprobe` using your OS package manager.
3. Install the official `realesrgan-ncnn-vulkan` release and its model files; put the executable on `PATH` or set `REAL_ESRGAN_BIN` to its full path. The model files must be where that executable expects them.
4. Start the server from the repository root: `uvicorn server.main:app --host 127.0.0.1 --port 8000`
5. Open `http://127.0.0.1:8000`.

Configure the model with `REAL_ESRGAN_MODEL=realesrgan-x4plus` (default) or `realesr-animevideov3`. The server invokes the real model at **2× output scale**. `/api/health` reports whether the executable is found.

## Processing flow

The web UI uploads the selected clip to `POST /api/jobs`, polls job status, then previews or downloads the MP4 result. The backend extracts frames with FFmpeg, runs Real-ESRGAN on the image sequence, and muxes the original audio into the upscaled video. The MVP accepts MP4, MOV, M4V, WebM, and MKV files up to 500 MB and 2 minutes. Processing is sequential and can take several minutes; GPU support depends on the NCNN Vulkan build and available hardware.

Input files, frame intermediates, and generated outputs are stored under `data/jobs/`. Keep this directory private and configure `FRAME_DATA_DIR` to use another location. Job metadata is held in memory and is lost on server restart. Add authentication, rate limiting, quotas, cleanup, and durable job storage before exposing this prototype publicly.

## Privacy and rights

Ordinary playback is local in the browser. **AI processing uploads the chosen video to this app's server**; disclose that to users and use storage/retention policies appropriate to your deployment. Only process videos you own or are authorized to modify. The app does not import third-party movie links or bypass DRM.

## Current limitations

- This is actual neural frame upscaling with Real-ESRGAN, not the CSS brightness/contrast/saturation filters in the player.
- Frame extraction re-times frames to a capped constant frame rate (up to 30 FPS); this MVP is not designed for variable-frame-rate or long-form media workflows.
- The result is encoded as H.264/AAC MP4. Audio is preserved when present.
- GPU/model installation is external; the Python app intentionally does not download model weights or execute a bundled binary automatically.
