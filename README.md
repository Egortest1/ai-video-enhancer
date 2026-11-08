# Frame — AI Video Enhancer MVP

A small Russian-language, responsive video library and browser player prototype.

## Run

Open `index.html` in a modern browser, or serve this directory with any static HTTP server. No build step or external JavaScript dependencies are required.

## Included

- Add local video files by picker or drag-and-drop.
- Preview and playback in a custom player with seeking, volume, ±10-second jumps, playback speed, fullscreen and theater mode.
- Search and sort the current in-memory library; remove a video from the list.
- Keyboard shortcuts: Space (play/pause), Left/Right (seek 5 seconds), M (mute), F (fullscreen), Escape (close player).
- Brightness, contrast and saturation controls applied as browser CSS filters.
- Responsive layout and a privacy-focused local-only workflow.

## Important

This prototype does **not** perform AI upscaling or server-side video processing. The image controls are visual playback filters only. Files are loaded with browser object URLs, are not uploaded to a server, and the library is cleared when the page is reloaded. Browser codec support varies by format.
