from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from fractions import Fraction
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("FRAME_DATA_DIR", ROOT / "data")).resolve()
JOBS_DIR = DATA_DIR / "jobs"
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(500 * 1024 * 1024)))
MAX_DURATION_SECONDS = int(os.getenv("MAX_DURATION_SECONDS", "120"))
MAX_FPS = 30
ESRGAN_BIN = os.getenv("REAL_ESRGAN_BIN", "realesrgan-ncnn-vulkan")
ESRGAN_MODEL = os.getenv("REAL_ESRGAN_MODEL", "realesrgan-x4plus")
ALLOWED_MODELS = {"realesrgan-x4plus", "realesr-animevideov3"}
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm", ".mkv"}

JOBS_DIR.mkdir(parents=True, exist_ok=True)
app = FastAPI(title="Frame AI Video Enhancer", version="1.0.0")
executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="frame-ai")
jobs: dict[str, dict[str, Any]] = {}
jobs_lock = threading.Lock()


def run(command: list[str], *, timeout: int = 7200) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=True, capture_output=True, text=True, timeout=timeout)


def probe_video(path: Path) -> tuple[float, float]:
    result = run([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=avg_frame_rate,duration:format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ], timeout=60)
    values = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    fps = 24.0
    duration = 0.0
    for value in values:
        if "/" in value:
            try:
                fps = float(Fraction(value))
            except (ValueError, ZeroDivisionError):
                pass
        else:
            try:
                number = float(value)
                if number > 0:
                    duration = max(duration, number)
            except ValueError:
                pass
    return min(max(fps, 1.0), MAX_FPS), duration


def set_job(job_id: str, **values: Any) -> None:
    with jobs_lock:
        jobs[job_id].update(values)


def process_job(job_id: str, input_path: Path, work_dir: Path, output_path: Path, fps: float) -> None:
    frames_in = work_dir / "frames-in"
    frames_out = work_dir / "frames-out"
    frames_in.mkdir()
    frames_out.mkdir()
    try:
        set_job(job_id, status="processing", progress=5, message="Подготавливаем видеокадры…")
        run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(input_path),
            "-map", "0:v:0", "-vf", f"fps={fps:.6f}", "-start_number", "0",
            str(frames_in / "%08d.png"),
        ])
        if not any(frames_in.iterdir()):
            raise RuntimeError("Не удалось извлечь кадры из видео.")

        set_job(job_id, progress=15, message="Real-ESRGAN улучшает кадры. Это может занять несколько минут…")
        run([
            ESRGAN_BIN, "-i", str(frames_in), "-o", str(frames_out),
            "-n", ESRGAN_MODEL, "-s", "2", "-f", "png",
        ], timeout=7200)
        if not any(frames_out.iterdir()):
            raise RuntimeError("AI-модель не создала обработанные кадры.")

        set_job(job_id, progress=88, message="Собираем видео и исходную аудиодорожку…")
        run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-framerate", f"{fps:.6f}", "-i", str(frames_out / "%08d.png"),
            "-i", str(input_path), "-map", "0:v:0", "-map", "1:a?",
            "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(output_path),
        ])
        set_job(job_id, status="done", progress=100, message="AI-улучшение завершено.", output=str(output_path))
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or "").strip().splitlines()
        message = detail[-1][:400] if detail else "Внешний обработчик видео завершился с ошибкой."
        set_job(job_id, status="failed", progress=0, message="Обработка завершилась с ошибкой.", error=message)
    except Exception as exc:  # noqa: BLE001 - expose a concise task error to the UI
        set_job(job_id, status="failed", progress=0, message="Обработка завершилась с ошибкой.", error=str(exc)[:400])
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


@app.get("/api/health")
def health() -> dict[str, Any]:
    binary = shutil.which(ESRGAN_BIN) if not os.path.isabs(ESRGAN_BIN) else (ESRGAN_BIN if Path(ESRGAN_BIN).is_file() else None)
    return {"status": "ok", "model_binary_available": bool(binary), "model": ESRGAN_MODEL}


@app.post("/api/jobs", status_code=202)
def create_job(file: UploadFile = File(...)) -> dict[str, str]:
    suffix = Path(file.filename or "video.mp4").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(415, "Поддерживаются MP4, MOV, M4V, WebM и MKV.")
    if ESRGAN_MODEL not in ALLOWED_MODELS:
        raise HTTPException(500, "В конфигурации указана неизвестная AI-модель.")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise HTTPException(503, "На сервере не установлены FFmpeg и ffprobe.")
    if not (os.path.isabs(ESRGAN_BIN) and Path(ESRGAN_BIN).is_file()) and not shutil.which(ESRGAN_BIN):
        raise HTTPException(503, "Real-ESRGAN не установлен. Настройте REAL_ESRGAN_BIN по инструкции README.")
    job_id = uuid.uuid4().hex
    work_dir = JOBS_DIR / job_id
    work_dir.mkdir(parents=True)
    input_path = work_dir / f"input{suffix}"
    total = 0
    try:
        with input_path.open("wb") as destination:
            while chunk := file.file.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, "Файл слишком большой (максимум 500 МБ).")
                destination.write(chunk)
    except Exception:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise
    finally:
        file.file.close()
    if total == 0:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(400, "Загружен пустой файл.")
    try:
        fps, duration = probe_video(input_path)
        if duration <= 0 or duration > MAX_DURATION_SECONDS:
            raise HTTPException(413, "Для MVP длительность ролика должна быть не больше 2 минут.")
    except HTTPException:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise
    except Exception:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(400, "Не удалось прочитать видео. Проверьте формат и целостность файла.")

    output_path = JOBS_DIR / f"{job_id}-enhanced.mp4"
    with jobs_lock:
        jobs[job_id] = {
            "id": job_id, "status": "queued", "progress": 1,
            "message": "Видео принято в очередь…", "filename": re.sub(r"[^\w.-]+", "_", Path(file.filename or "video").stem) + "-enhanced.mp4",
            "output": None, "error": None,
        }
    executor.submit(process_job, job_id, input_path, work_dir, output_path, fps)
    return {"id": job_id, "status": "queued"}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(404, "Задача не найдена или сервер перезапускался.")
        return {key: value for key, value in job.items() if key != "output"}


@app.get("/api/jobs/{job_id}/result")
def get_result(job_id: str) -> FileResponse:
    with jobs_lock:
        job = jobs.get(job_id)
        if not job or job["status"] != "done" or not job.get("output"):
            raise HTTPException(409, "Результат ещё не готов.")
        result_path = Path(job["output"])
        filename = job["filename"]
    if not result_path.is_file():
        raise HTTPException(404, "Файл результата уже удалён.")
    return FileResponse(result_path, media_type="video/mp4", filename=filename)


@app.get("/")
def index() -> FileResponse:
    return FileResponse(ROOT / "index.html")


for static_file in ("styles.css", "app.js", "ai-enhance.js"):
    @app.get(f"/{static_file}", name=f"static_{static_file.replace('.', '_')}")
    def static_asset(static_file: str = static_file) -> FileResponse:
        return FileResponse(ROOT / static_file)
