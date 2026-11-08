# Frame — AI Video Enhancer MVP

Russian-language browser video library/player with an optional Real-ESRGAN backend.

## Open videos

- **Direct video URL:** paste a public `https://`/`http://` URL that points directly to a browser-playable video stream/file. Playback depends on the source allowing browser access, the URL remaining valid, and the browser supporting its codec. A normal webpage URL is not the same as a video URL.
- **YouTube/Vimeo:** public videos can be played through the provider's official embed player. Their controls and playback rules belong to the provider; DRM, private/restricted videos, and downloading/extracting their streams are not supported.
- Other sites may provide an official Embed link or direct media URL. There is no universal way for a page to turn arbitrary website links into video: many sites block embedding, require login, use DRM, or expose no direct stream. We do not bypass those restrictions.

Internet links are played by the browser and are not proxied or downloaded by the app server. Cross-origin, expired, geo-restricted, or unsupported links may fail. Real-ESRGAN processing currently works with a selected local video file only; processing remote URLs would require a separately secured source integration and permission to process that content. When a file is sent for AI processing, it is uploaded to the configured app server.

## Run the web app and AI backend

Requires Python 3.11+, FFmpeg/ffprobe, and a Real-ESRGAN NCNN Vulkan executable plus its model files.

1. Install dependencies: `python -m pip install -r requirements.txt`
2. Install `ffmpeg` and `ffprobe` using your OS package manager.
3. Install the official `realesrgan-ncnn-vulkan` release and model files; put the executable on `PATH` or set `REAL_ESRGAN_BIN` to its full path.
4. From the repository root run: `uvicorn server.main:app --host 127.0.0.1 --port 8000`
5. Open `http://127.0.0.1:8000`.

Configure `REAL_ESRGAN_MODEL=realesrgan-x4plus` (default) or `realesr-animevideov3`. The server runs the model at 2× output scale. The MVP accepts supported files up to 500 MB and 2 minutes. The upload, intermediate frames, and output are stored under `data/jobs/`; keep that directory private. Add authentication, rate limiting, quotas, retention cleanup, and durable job storage before public deployment.

## Privacy and rights

Opening a direct URL sends the request from the user's browser to the media provider. An embedded video is served by its provider. AI processing uploads the chosen file to this app's server. Only use videos you own or are authorized to view/process. The app does not extract streams from third-party pages or bypass DRM/access controls.
