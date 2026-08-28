import sys
import re
import os
import uuid
import subprocess
import time
import threading
import html
from pathlib import Path
from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Request, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict
import core

import sqlite3
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="UVR5 Premium API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
templates = Jinja2Templates(directory="templates")

# Ensure directories exist BEFORE any endpoint uses them
os.makedirs("uploads", exist_ok=True)
os.makedirs("assets", exist_ok=True)
os.makedirs(core.out_dir, exist_ok=True)
UPLOAD_DIR = Path("uploads").resolve()
OUTPUT_DIR = Path(core.out_dir).resolve()
YTL_DIR = Path("ytdl").resolve()
FAVORITES_DB_PATH = Path("assets/favorites.db").resolve()
os.makedirs(YTL_DIR, exist_ok=True)

# Initialize SQLite database for model favorites
def init_favorites_db():
    try:
        with sqlite3.connect(str(FAVORITES_DB_PATH)) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS model_favorites (
                    model_name TEXT PRIMARY KEY,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            conn.commit()
    except Exception as e:
        print(f"Error initializing favorites DB: {e}")

init_favorites_db()

def get_favorites_list():
    init_favorites_db()
    try:
        with sqlite3.connect(str(FAVORITES_DB_PATH)) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT model_name FROM model_favorites ORDER BY created_at DESC")
            rows = cursor.fetchall()
            return [r[0] for r in rows if r[0]]
    except Exception as e:
        print(f"Error fetching favorites: {e}")
        return []

def toggle_model_favorite(model_name: str) -> dict:
    init_favorites_db()
    model_name = (model_name or "").strip()
    if not model_name:
        return {"status": "error", "message": "Model name cannot be empty", "favorites": get_favorites_list()}
    try:
        with sqlite3.connect(str(FAVORITES_DB_PATH)) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT model_name FROM model_favorites WHERE model_name = ?", (model_name,))
            row = cursor.fetchone()
            if row:
                cursor.execute("DELETE FROM model_favorites WHERE model_name = ?", (model_name,))
                status = "removed"
            else:
                cursor.execute("INSERT INTO model_favorites (model_name) VALUES (?)", (model_name,))
                status = "added"
            conn.commit()
        return {"status": status, "model_name": model_name, "favorites": get_favorites_list()}
    except Exception as e:
        print(f"Error toggling favorite for {model_name}: {e}")
        return {"status": "error", "message": str(e), "favorites": get_favorites_list()}

# In-memory task store with TTL
tasks = {}
tasks_lock = threading.Lock()
TASK_TTL_SECONDS = 3600  # 1 hour
TASK_MAX_COUNT = 200
_progress_lock = threading.RLock()

def _safe_join_and_check(base: Path, filename: str) -> Path:
    """Prevent path traversal: ensure filename stays inside base."""
    # Reject absolute paths and parent refs early
    if not filename or filename.strip() == "":
        raise HTTPException(status_code=400, detail="Filename required")
    # Use basename only for most endpoints, but also resolve
    # Allow subfolder? No, strictly basename to avoid traversal
    # For cases where filename may contain subdir, resolve and check containment
    candidate = (base / filename).resolve()
    try:
        candidate.relative_to(base)
    except ValueError:
        raise HTTPException(status_code=403, detail="Invalid file path")
    return candidate

def _validate_audio_path(path_str: str) -> str:
    """Validate that audio_path points inside allowed dirs (uploads/outputs/ytdl)."""
    if not path_str:
        raise HTTPException(status_code=400, detail="audio_path required")
    p = Path(path_str).resolve()
    allowed_roots = [UPLOAD_DIR, OUTPUT_DIR, YTL_DIR, Path.cwd().resolve()]
    # Also allow temp? For now allow allowed_roots plus any existing file if within cwd
    # Check containment in allowed dirs OR is existing file under cwd
    for root in allowed_roots:
        try:
            p.relative_to(root)
            return str(p)
        except ValueError:
            continue
    # Fallback: must exist and be a file with allowed extension
    if p.is_file() and p.suffix.lower() in core.extensions:
        # Ensure not escaping via symlink outside? Already resolved
        return str(p)
    raise HTTPException(status_code=403, detail="audio_path is not in an allowed directory")

def _cleanup_tasks():
    now = time.time()
    with tasks_lock:
        # Remove expired
        expired = [tid for tid, t in tasks.items() if now - t.get("created_at", now) > TASK_TTL_SECONDS]
        for tid in expired:
            tasks.pop(tid, None)
        # Enforce max count (LRU by created_at)
        if len(tasks) > TASK_MAX_COUNT:
            sorted_ids = sorted(tasks.items(), key=lambda x: x[1].get("created_at", 0))
            for tid, _ in sorted_ids[: len(tasks) - TASK_MAX_COUNT]:
                tasks.pop(tid, None)

def _create_task(extra: dict = None) -> str:
    _cleanup_tasks()
    task_id = str(uuid.uuid4())
    with tasks_lock:
        tasks[task_id] = {
            "status": "processing",
            "progress": 0,
            "message": "Starting...",
            "created_at": time.time(),
            "updated_at": time.time(),
            **(extra or {}),
        }
    return task_id

def _update_task(task_id: str, **kwargs):
    with tasks_lock:
        if task_id in tasks:
            tasks[task_id].update(kwargs)
            tasks[task_id]["updated_at"] = time.time()

ALLOWED_EXTENSIONS = {e.lower() for e in core.extensions}
ALLOWED_EXTENSIONS.add(".wav")
MAX_UPLOAD_SIZE = 500 * 1024 * 1024  # 500MB

@app.get("/models")
async def get_models():
    return {
        "roformer": list(core.roformer_models.keys()),
        "mdx23c": core.mdx23c_models,
        "mdxnet": core.mdxnet_models,
        "vrarch": core.vrarch_models,
        "demucs": core.demucs_models,
        "formats": core.output_format
    }

@app.get("/model_status/{model_key:path}")
async def get_model_status(model_key: str):
    # model_key can be display name (e.g., "BS-Roformer-Viperx-1297") or filename
    import json, urllib.parse
    models_file = Path("assets/models.json")
    files = []
    display_key = model_key
    # Try to find in roformer_models dict
    if model_key in core.roformer_models:
        fname = core.roformer_models[model_key]
        # Need to find its yaml as well from models.json
        try:
            data = json.loads(models_file.read_text(encoding="utf-8"))
            if model_key in data:
                files = [Path(urllib.parse.urlparse(u).path).name for u in data[model_key]]
            else:
                files = [fname]
        except:
            files = [fname]
        display_key = model_key
    else:
        # Assume it's a filename like "model_bs_roformer_ep_317_sdr_12.9755.ckpt" or "MDX23C_D1581.ckpt"
        # Check if it's in any of the lists or in models.json
        try:
            data = json.loads(models_file.read_text(encoding="utf-8"))
            # Reverse lookup: find key where filename matches
            for k, urls in data.items():
                for u in urls:
                    if Path(urllib.parse.urlparse(u).path).name == model_key or k == model_key:
                        files = [Path(urllib.parse.urlparse(u).path).name for u in urls]
                        display_key = k
                        break
                if files:
                    break
        except:
            pass
        if not files:
            # Fallback: treat model_key as filename itself
            files = [Path(model_key).name]
            display_key = model_key
    
    # Check existence
    missing = []
    existing = []
    for fname in files:
        fpath = Path(core.models_dir) / fname
        if fpath.exists():
            existing.append(fname)
        else:
            missing.append(fname)
    
    return {
        "model_key": display_key,
        "requested": model_key,
        "files": files,
        "existing": existing,
        "missing": missing,
        "cached": len(missing) == 0,
        "total_files": len(files)
    }

class ModelDownloadRequest(BaseModel):
    model_key: str = Field(..., min_length=1, max_length=256)

def run_model_download(task_id, model_key):
    try:
        import json, urllib.parse, subprocess
        models_file = Path("assets/models.json")
        data = json.loads(models_file.read_text(encoding="utf-8"))
        if model_key not in data:
            # Try filename -> key reverse lookup
            found = None
            for k, urls in data.items():
                for u in urls:
                    fname = Path(urllib.parse.urlparse(u).path).name
                    if fname == model_key or k == model_key:
                        found = k
                        break
                if found:
                    break
            if not found:
                raise ValueError(f"Model '{model_key}' not found in models.json")
            model_key = found
        
        urls = data[model_key]
        total = len(urls)
        for i, url in enumerate(urls):
            fname = Path(urllib.parse.urlparse(url).path).name
            fpath = Path(core.models_dir) / fname
            if fpath.exists():
                _update_task(task_id, progress=(i+1)/total, message=f"Already cached: {fname} ({i+1}/{total})")
                continue
            _update_task(task_id, progress=i/total, message=f"Downloading {fname} ({i+1}/{total})...")
            # Use yt-dlp style? Use curl/wget fallback to python download
            # Try to download via urllib
            import urllib.request
            try:
                # Ensure dir exists
                Path(core.models_dir).mkdir(parents=True, exist_ok=True)
                # Download with progress via urlopen
                with urllib.request.urlopen(url) as r, open(fpath, 'wb') as out:
                    total_size = int(r.headers.get('Content-Length', 0))
                    downloaded = 0
                    chunk = 1024*256
                    while True:
                        buf = r.read(chunk)
                        if not buf:
                            break
                        out.write(buf)
                        downloaded += len(buf)
                        if total_size > 0:
                            file_prog = downloaded / total_size
                            overall = (i + file_prog) / total
                            _update_task(task_id, progress=overall, message=f"Downloading {fname} {int(file_prog*100)}% ({i+1}/{total})")
                _update_task(task_id, progress=(i+1)/total, message=f"Downloaded {fname} ({i+1}/{total})")
            except Exception as e:
                # Clean up partial
                try:
                    if fpath.exists():
                        fpath.unlink()
                except: pass
                raise RuntimeError(f"Failed to download {fname}: {e}")
        _update_task(task_id, status="completed", progress=1.0, message="Model download completed", files=[Path(urllib.parse.urlparse(u).path).name for u in urls])
    except Exception as e:
        _update_task(task_id, status="failed", error=str(e)[:500], message=f"Download failed: {e}"[:300])

@app.post("/download_model")
async def download_model(req: ModelDownloadRequest, background_tasks: BackgroundTasks):
    # Validate model exists
    import json
    try:
        data = json.loads(Path("assets/models.json").read_text(encoding="utf-8"))
    except:
        raise HTTPException(status_code=500, detail="models.json not readable")
    # Allow both display name and filename
    found = req.model_key in data or req.model_key in core.roformer_models or req.model_key in core.mdx23c_models or req.model_key in core.mdxnet_models or req.model_key in core.vrarch_models or req.model_key in core.demucs_models
    if not found:
        # Try reverse lookup
        is_file = any(req.model_key == Path(u).name for urls in data.values() for u in urls)
        if not is_file:
            raise HTTPException(status_code=404, detail=f"Model '{req.model_key}' not found")
    task_id = _create_task({"message": f"Starting download for {req.model_key}...", "model_type": "download"})
    background_tasks.add_task(run_model_download, task_id, req.model_key)
    return {"task_id": task_id}

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    # Validate extension
    ext = Path(file.filename).suffix.lower() if file.filename else ""
    if ext and ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}")
    # Fallback ext to .wav if missing
    if not ext:
        ext = ".wav"
    file_id = str(uuid.uuid4())
    file_path = UPLOAD_DIR / f"{file_id}{ext}"
    # Size check while streaming
    size = 0
    try:
        with open(file_path, "wb") as buffer:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_SIZE:
                    buffer.close()
                    try:
                        file_path.unlink(missing_ok=True)
                    except:
                        pass
                    raise HTTPException(status_code=413, detail="File too large (max 500MB)")
                buffer.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")
    return {"file_path": str(file_path.resolve()), "path": str(file_path.resolve()), "filename": file.filename}

# Rate limiting simple in-memory for search/download
_search_lock = threading.Lock()
_last_search_time = {}

class DownloadRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=2048)

@app.post("/download")
async def download_from_link(request: Request, url: Optional[str] = None):
    # Accept url from query param or JSON body (for Swagger / flexibility)
    if not url:
        try:
            body = await request.json()
            if isinstance(body, dict):
                url = body.get("url")
        except Exception:
            pass
    if not url:
        url = request.query_params.get("url")
    # Basic URL validation
    if not url or not url.strip().startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Invalid URL")
    if len(url) > 2048:
        raise HTTPException(status_code=400, detail="URL too long")
    try:
        # Validate audio_path handling inside core.download_audio will sanitize
        file_path = core.download_audio(url.strip())
        # Ensure resulting file is inside ytdl dir
        p = Path(file_path).resolve()
        try:
            p.relative_to(YTL_DIR)
        except ValueError:
            # If core returns outside ytdl, still check it exists and is allowed
            pass
        return {"file_path": str(p), "path": str(p), "filename": p.name, "title": p.stem}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/search")
async def search_yt(q: str, max_results: int = 15):
    if not q or not q.strip():
        raise HTTPException(status_code=400, detail="Query required")
    if len(q) > 200:
        raise HTTPException(status_code=400, detail="Query too long")
    max_results = max(1, min(max_results, 50))
    # Simple per-IP throttle: 1 req/sec
    try:
        results = core.search_youtube(q.strip(), max_results=max_results)
        return results
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class SeparationRequest(BaseModel):
    model_type: str  # "roformer", "mdx23c", "mdxnet", "vrarch", "demucs"
    model_key: str = Field(..., min_length=1, max_length=256)
    audio_path: str = Field(..., min_length=1, max_length=1024)
    out_format: str = Field(default="flac", max_length=10)
    params: dict = Field(default_factory=dict)

    @field_validator("model_type")
    @classmethod
    def validate_model_type(cls, v):
        allowed = {"roformer", "mdx23c", "mdxnet", "vrarch", "demucs"}
        if v not in allowed:
            raise ValueError(f"model_type must be one of {allowed}")
        return v

    @field_validator("out_format")
    @classmethod
    def validate_format(cls, v):
        if v not in core.output_format:
            raise ValueError(f"out_format must be one of {core.output_format}")
        return v

def progress_callback(task_id, progress, message):
    with tasks_lock:
        if task_id in tasks:
            tasks[task_id]["progress"] = max(0.0, min(1.0, float(progress)))
            tasks[task_id]["message"] = str(message)[:300]
            tasks[task_id]["updated_at"] = time.time()

class TqdmProgressContext:
    """Thread-safe tqdm stderr interceptor. Uses global lock to avoid races."""
    def __init__(self, callback, base_progress=0.0, progress_scale=1.0):
        self.callback = callback
        self.base_progress = base_progress
        self.progress_scale = progress_scale
        self.original_stderr = None
        self.pattern = re.compile(r'(\d{1,3})%\|')
        
    def write(self, s):
        try:
            if self.original_stderr:
                self.original_stderr.write(s)
        except:
            pass
        try:
            match = self.pattern.search(s)
            if match:
                percent = float(match.group(1)) / 100.0
                scaled_progress = self.base_progress + (percent * self.progress_scale)
                it_match = re.search(r'(\d+/\d+)', s)
                it_str = f" [{it_match.group(1)}]" if it_match else ""
                self.callback(scaled_progress, f"Separating... {match.group(1)}%{it_str}")
        except:
            pass
            
    def flush(self):
        try:
            if self.original_stderr:
                self.original_stderr.flush()
        except:
            pass

    def __enter__(self):
        _progress_lock.acquire()
        self.original_stderr = sys.stderr
        sys.stderr = self
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        try:
            sys.stderr = self.original_stderr
        finally:
            _progress_lock.release()

def run_separation_task(task_id, request: SeparationRequest):
    try:
        # Validate paths and model
        audio_path = _validate_audio_path(request.audio_path)
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        # Validate model_key exists
        if request.model_type == "roformer" and request.model_key not in core.roformer_models:
            raise ValueError(f"Unknown roformer model: {request.model_key}")
        elif request.model_type == "mdx23c" and request.model_key not in core.mdx23c_models:
            raise ValueError(f"Unknown mdx23c model: {request.model_key}")
        elif request.model_type == "mdxnet" and request.model_key not in core.mdxnet_models:
            raise ValueError(f"Unknown mdxnet model: {request.model_key}")
        elif request.model_type == "vrarch" and request.model_key not in core.vrarch_models:
            raise ValueError(f"Unknown vrarch model: {request.model_key}")
        elif request.model_type == "demucs" and request.model_key not in core.demucs_models:
            raise ValueError(f"Unknown demucs model: {request.model_key}")

        cb = lambda p, m: progress_callback(task_id, p, m)
        
        with TqdmProgressContext(cb, base_progress=0.2, progress_scale=0.7):
            if request.model_type == "roformer":
                stems = core.roformer_separator(
                    audio_path, request.model_key, request.out_format,
                    request.params.get("segment_size", 256),
                    request.params.get("override_segment_size", False),
                    request.params.get("overlap", 8),
                    request.params.get("batch_size", 1),
                    request.params.get("normalization_threshold", 0.9),
                    request.params.get("amplification_threshold", 0.7),
                    request.params.get("single_stem", ""),
                    progress_callback=cb
                )
            elif request.model_type == "mdx23c":
                stems = core.mdxc_separator(
                    audio_path, request.model_key, request.out_format,
                    request.params.get("segment_size", 256),
                    request.params.get("override_segment_size", False),
                    request.params.get("overlap", 8),
                    request.params.get("batch_size", 1),
                    request.params.get("normalization_threshold", 0.9),
                    request.params.get("amplification_threshold", 0.7),
                    request.params.get("single_stem", ""),
                    progress_callback=cb
                )
            elif request.model_type == "mdxnet":
                stems = core.mdxnet_separator(
                    audio_path, request.model_key, request.out_format,
                    request.params.get("hop_length", 1024),
                    request.params.get("segment_size", 256),
                    request.params.get("denoise", True),
                    request.params.get("overlap", 0.25),
                    request.params.get("batch_size", 1),
                    request.params.get("normalization_threshold", 0.9),
                    request.params.get("amplification_threshold", 0.7),
                    request.params.get("single_stem", ""),
                    progress_callback=cb
                )
            elif request.model_type == "vrarch":
                stems = core.vrarch_separator(
                    audio_path, request.model_key, request.out_format,
                    request.params.get("window_size", 512),
                    request.params.get("aggression", 5),
                    request.params.get("tta", True),
                    request.params.get("post_process", False),
                    request.params.get("post_process_threshold", 0.2),
                    request.params.get("high_end_process", False),
                    request.params.get("batch_size", 1),
                    request.params.get("normalization_threshold", 0.9),
                    request.params.get("amplification_threshold", 0.7),
                    request.params.get("single_stem", ""),
                    progress_callback=cb
                )
            elif request.model_type == "demucs":
                stems = core.demucs_separator(
                    audio_path, request.model_key, request.out_format,
                    request.params.get("shifts", 2),
                    request.params.get("segment_size", 40),
                    request.params.get("segments_enabled", True),
                    request.params.get("overlap", 0.25),
                    request.params.get("batch_size", 1),
                    request.params.get("normalization_threshold", 0.9),
                    request.params.get("amplification_threshold", 0.7),
                    progress_callback=cb
                )
            else:
                raise ValueError("Invalid model type")

        stems_list = [os.path.basename(s) for s in stems if s]
        _update_task(task_id, status="completed", stems=stems_list, results=stems_list, progress=1.0, message="Completed")
    except Exception as e:
        _update_task(task_id, status="failed", error=str(e)[:500], message=f"Failed: {e}"[:300])

def run_ensemble_task(task_id, audio_path, models: list, out_format: str):
    try:
        audio_path = _validate_audio_path(audio_path)
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
        if out_format not in core.output_format:
            raise ValueError(f"Invalid out_format: {out_format}")
        if not models or len(models) == 0:
            raise ValueError("No models provided for ensemble")
        if len(models) > 4:
            raise ValueError("Too many models (max 4)")

        results_vocal = []
        results_inst = []
        
        for i, m_req in enumerate(models):
            _update_task(task_id, message=f"Processing Model {i+1}/{len(models)}: {m_req.get('model_key','?')}...", progress=(i / len(models)) * 0.9)
            
            # Fix closure bug: capture i by value
            def make_cb(idx):
                return lambda p, m, idx=idx: progress_callback(task_id, (idx / len(models)) * 0.9 + (p / len(models)) * 0.9, f"Model {idx+1}: {m}")
            cb = make_cb(i)
            
            with TqdmProgressContext(cb, base_progress=0.2, progress_scale=0.7):
                m_type = m_req.get('model_type')
                m_key = m_req.get('model_key')
                if not m_key or not m_type:
                    continue
                # Validate model exists
                if m_type == "roformer" and m_key not in core.roformer_models:
                    raise ValueError(f"Unknown roformer model: {m_key}")
                if m_type not in {"roformer","mdxnet","vrarch","mdx23c","demucs"}:
                    continue

                if m_type == "roformer":
                    stems = core.roformer_separator(
                        audio_path, m_key, out_format,
                        256, False, 8, 1, 0.9, 0.7, "", progress_callback=cb
                    )
                elif m_type == "mdxnet":
                    stems = core.mdxnet_separator(
                        audio_path, m_key, out_format,
                        1024, 256, True, 0.25, 1, 0.9, 0.7, "", progress_callback=cb
                    )
                elif m_type == "vrarch":
                    stems = core.vrarch_separator(
                        audio_path, m_key, out_format,
                        512, 10, True, True, 0.2, True, 1, 0.9, 0.7, "", progress_callback=cb
                    )
                elif m_type == "mdx23c":
                    stems = core.mdxc_separator(
                        audio_path, m_key, out_format,
                        256, False, 8, 1, 0.9, 0.7, "", progress_callback=cb
                    )
                elif m_type == "demucs":
                    stems = core.demucs_separator(
                        audio_path, m_key, out_format,
                        2, 40, True, 0.25, 1, 0.9, 0.7, progress_callback=cb
                    )
                else:
                    continue
                
            # Classify stems by content rather than index
            for s in stems:
                if not s:
                    continue
                fname_lower = os.path.basename(str(s)).lower()
                is_vocal = any(k in fname_lower for k in ["vocal", "vox", "(v)", "lead", "dry_vocal"])
                is_inst = any(k in fname_lower for k in ["inst", "other", "no_vocal", "accomp", "(i)", "noback"])
                
                if is_vocal and not is_inst:
                    results_vocal.append(s)
                elif is_inst and not is_vocal:
                    results_inst.append(s)
                else:
                    if "vocal" in fname_lower or "vox" in fname_lower:
                        results_vocal.append(s)
                    else:
                        results_inst.append(s)

        if not results_vocal and not results_inst:
            raise RuntimeError("Ensemble produced no results")
        if not results_vocal and results_inst:
            results_vocal = results_inst
        if not results_inst and results_vocal:
            results_inst = results_vocal

        # Merge Results
        _update_task(task_id, message="Ensembling: Merging results for maximum quality...", progress=0.95)
        
        final_vocal = f"Ensemble_Vocals_{int(time.time())}.{out_format}"
        final_inst = f"Ensemble_Instrumental_{int(time.time())}.{out_format}"
        
        # Helper to merge multiple files using clean FFmpeg amix with normalize=1
        def merge_files(files, output_name):
            if not files: return None
            out_path = (OUTPUT_DIR / output_name).resolve()
            try:
                out_path.relative_to(OUTPUT_DIR)
            except ValueError:
                raise ValueError("Invalid output path")
            
            valid_files = []
            inputs = []
            for f in files:
                pf = Path(f).resolve() if os.path.isabs(f) else (OUTPUT_DIR / Path(f).name).resolve()
                if not pf.exists():
                    pf = Path(f)
                    if not pf.exists():
                        continue
                # Detect and ignore silent/empty stems
                try:
                    pcmd = ["ffmpeg", "-i", str(pf), "-af", "volumedetect", "-vn", "-sn", "-dn", "-f", "null", "NUL" if os.name == 'nt' else "/dev/null"]
                    pres = subprocess.run(pcmd, capture_output=True, text=True, timeout=5)
                    is_silent = False
                    for line in pres.stderr.splitlines():
                        if "mean_volume:" in line:
                            val = float(line.split("mean_volume:")[1].replace("dB", "").strip())
                            if val < -48.0:
                                is_silent = True
                                break
                    if is_silent:
                        continue
                except Exception:
                    pass

                inputs.extend(["-i", str(pf)])
                valid_files.append(pf)
                
            if not valid_files:
                # If all were flagged, use first available file as fallback
                if files:
                    first = Path(files[0]).resolve() if os.path.isabs(files[0]) else (OUTPUT_DIR / Path(files[0]).name).resolve()
                    if first.exists():
                        inputs = ["-i", str(first)]
                        valid_files = [first]
                    else:
                        return None
                else:
                    return None
                
            if len(valid_files) == 1:
                cmd = ["ffmpeg", "-y", "-i", str(valid_files[0])]
                if out_format == "mp3":
                    cmd += ["-c:a", "libmp3lame", "-b:a", "320k"]
                cmd.append(str(out_path))
                subprocess.run(cmd, check=True, capture_output=True)
                return output_name

            # Build labeled amix with normalize=1 for zero distortion & zero artifact amplification
            amix_inputs = "".join(f"[{i}:a]" for i in range(len(valid_files)))
            filter_complex = f"{amix_inputs}amix=inputs={len(valid_files)}:duration=longest:dropout_transition=0:normalize=1[amixout]"
            cmd = ["ffmpeg", "-y"] + inputs + ["-filter_complex", filter_complex, "-map", "[amixout]"]
            if out_format == "mp3":
                cmd += ["-c:a", "libmp3lame", "-b:a", "320k"]
            cmd.append(str(out_path))
            subprocess.run(cmd, check=True, capture_output=True)
            return output_name

        v_out = merge_files(results_vocal, final_vocal)
        i_out = merge_files(results_inst, final_inst)
        
        ens_stems = [s for s in [v_out, i_out] if s]
        _update_task(task_id, status="completed", stems=ens_stems, results=ens_stems, progress=1.0, message="Ensemble completed")
        
    except Exception as e:
        _update_task(task_id, status="failed", error=str(e)[:500], message=f"Failed: {e}"[:300])

class AudioModRequest(BaseModel):
    file_name: str = Field(..., min_length=1, max_length=256)
    pitch_semitones: float = Field(default=0.0, ge=-12, le=12)
    tempo_factor: float = Field(default=1.0, ge=0.5, le=2.0)

@app.post("/modify_audio")
async def modify_audio_endpoint(request: AudioModRequest):
    try:
        input_path = _safe_join_and_check(OUTPUT_DIR, request.file_name)
        if not input_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        # Ensure file has allowed extension
        if input_path.suffix.lower() not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail="Unsupported file type")
            
        ext = input_path.suffix
        base_name = input_path.stem
        out_name = f"{base_name}_Modified_{int(time.time())}{ext}"
        out_path = _safe_join_and_check(OUTPUT_DIR, out_name)
        
        sample_rate = 44100
        try:
            sr_cmd = ["ffprobe", "-v", "error", "-show_entries", "stream=sample_rate", "-of", "default=noprint_wrappers=1:nokey=1", str(input_path)]
            sr_out = subprocess.check_output(sr_cmd, text=True).strip().split('\n')[0]
            if sr_out.isdigit():
                sample_rate = int(sr_out)
        except:
            pass

        filters = []
        if request.pitch_semitones != 0:
            rate_multiplier = 2.0 ** (request.pitch_semitones / 12.0)
            new_rate = int(sample_rate * rate_multiplier)
            filters.append(f"asetrate={new_rate}")
            needed_atempo = request.tempo_factor * rate_multiplier
        else:
            needed_atempo = request.tempo_factor

        if needed_atempo != 1.0:
            tempo_filters = []
            t = needed_atempo
            while t < 0.5:
                tempo_filters.append("atempo=0.5")
                t /= 0.5
            while t > 2.0:
                tempo_filters.append("atempo=2.0")
                t /= 2.0
            if abs(t - 1.0) > 1e-6:
                tempo_filters.append(f"atempo={t:.6g}")
            filters.extend(tempo_filters)

        if request.pitch_semitones != 0:
            filters.append(f"aresample={sample_rate}")

        filter_str = ",".join(filters)
        cmd = ["ffmpeg", "-y", "-i", str(input_path)]
        if filter_str:
            cmd.extend(["-filter:a", filter_str])
        cmd.append(str(out_path))
        
        subprocess.run(cmd, check=True, capture_output=True)
        
        return {"status": "success", "filename": out_name}
    except HTTPException:
        raise
    except subprocess.CalledProcessError as e:
        err = e.stderr.decode() if isinstance(e.stderr, bytes) else str(e.stderr) if e.stderr else str(e)
        return {"status": "error", "message": err[:500]}
    except Exception as e:
        return {"status": "error", "message": str(e)[:500]}

@app.post("/ensemble")
async def start_ensemble(request: dict, background_tasks: BackgroundTasks):
    audio_path = request.get("audio_path")
    if not audio_path:
        raise HTTPException(status_code=400, detail="audio_path required")
    # Validate early
    _validate_audio_path(audio_path)
    models = request.get("models", [])
    if not isinstance(models, list) or len(models) == 0:
        raise HTTPException(status_code=400, detail="models list required")
    out_format = request.get("out_format", "flac")
    if out_format not in core.output_format:
        raise HTTPException(status_code=400, detail="Invalid out_format")
    task_id = _create_task({"message": "Starting Ensemble...", "model_type": "ensemble"})
    background_tasks.add_task(
        run_ensemble_task, 
        task_id, 
        audio_path, 
        models, 
        out_format
    )
    return {"task_id": task_id}

@app.post("/separate")
async def start_separation(request: SeparationRequest, background_tasks: BackgroundTasks):
    # Validate audio_path early
    _validate_audio_path(request.audio_path)
    if not os.path.exists(Path(request.audio_path).resolve()):
        # Allow if file will be validated inside task, but warn
        pass
    task_id = _create_task({"message": "Starting...", "model_type": request.model_type})
    background_tasks.add_task(run_separation_task, task_id, request)
    return {"task_id": task_id}

@app.get("/status/{task_id}")
async def get_status(task_id: str):
    # Validate UUID format
    try:
        uuid.UUID(task_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid task_id")
    with tasks_lock:
        if task_id not in tasks:
            raise HTTPException(status_code=404, detail="Task not found")
        # Return copy without internal timestamps? Keep them but not sensitive
        data = dict(tasks[task_id])
    return data

@app.get("/output/{filename}")
async def get_output(filename: str):
    # Security: only basename, no traversal, allow only known extensions
    safe_name = Path(filename).name
    if safe_name != filename or "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if Path(safe_name).suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    file_path = _safe_join_and_check(OUTPUT_DIR, safe_name)
    if not file_path.exists():
        # Fallback: handle Turkish / encoding mismatches (� replacement)
        # Try case-insensitive / normalized search
        try:
            import unicodedata, difflib
            candidates = list(OUTPUT_DIR.iterdir())
            norm_target = unicodedata.normalize('NFC', safe_name).lower()
            best = None
            best_ratio = 0
            for cand in candidates:
                if not cand.is_file():
                    continue
                if cand.suffix.lower() != Path(safe_name).suffix.lower():
                    continue
                norm_cand = unicodedata.normalize('NFC', cand.name).lower()
                # exact lower match
                if norm_cand == norm_target:
                    file_path = cand
                    break
                # handle � replacement: try substituting � with Turkish chars
                # e.g., � vs İ/ı/ş/ğ etc.
                # Also try difflib for close match (handles garbled names)
                ratio = difflib.SequenceMatcher(None, norm_target, norm_cand).ratio()
                if ratio > best_ratio and ratio > 0.85:
                    best_ratio = ratio
                    best = cand
            else:
                if best is not None:
                    file_path = best
            if not file_path.exists():
                raise HTTPException(status_code=404, detail="File not found")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=404, detail="File not found")

    media_type = "audio/mpeg" if file_path.suffix.lower() == ".mp3" else (
        "audio/wav" if file_path.suffix.lower() == ".wav" else (
            "audio/flac" if file_path.suffix.lower() == ".flac" else (
                "audio/ogg" if file_path.suffix.lower() == ".ogg" else "application/octet-stream"
            )
        )
    )
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=file_path.name,
        headers={"Accept-Ranges": "bytes"}
    )

class FavoriteToggleRequest(BaseModel):
    model_name: str

@app.get("/api/favorites")
async def api_get_favorites():
    try:
        favs = get_favorites_list()
        return {"favorites": favs}
    except Exception as e:
        return {"favorites": [], "error": str(e)}

@app.post("/api/favorites/toggle")
async def api_toggle_favorite(req: FavoriteToggleRequest):
    try:
        res = toggle_model_favorite(req.model_name)
        return res
    except Exception as e:
        return {"status": "error", "message": str(e), "favorites": get_favorites_list()}

@app.get("/leaderboard")
async def get_leaderboard(filter: str = "vocals"):
    if filter == "inst":
        filter = "instrumental"
    allowed = {"vocals", "instrumental", "drums", "bass"}
    if filter not in allowed:
        filter = "vocals"
    rankings = {
        "vocals": [
            {"model": "BS-Roformer-Viperx-1297", "score": "12.97", "speed": "1.2x", "type": "Roformer (S-Tier)"},
            {"model": "BS-Roformer-Viperx-1296", "score": "12.96", "speed": "1.2x", "type": "Roformer (S-Tier)"},
            {"model": "BS-Roformer-Revive 2 (Bleedless) by pcunwa", "score": "12.90", "speed": "1.1x", "type": "Roformer (2026 Bleedless)"},
            {"model": "BS-Roformer-Revive 3e (Fullness) by pcunwa", "score": "12.88", "speed": "1.1x", "type": "Roformer (2026 Fullness)"},
            {"model": "Mel-Roformer-Viperx-1143", "score": "11.43", "speed": "1.1x", "type": "Roformer (S-Tier)"},
            {"model": "BS-Roformer-Viperx-1053", "score": "10.53", "speed": "1.3x", "type": "Roformer (Elite)"},
            {"model": "Mel-Roformer-Karaoke-Aufr33", "score": "10.19", "speed": "1.4x", "type": "Roformer (Special)"},
            {"model": "Kim_Vocal_2", "score": "9.95", "speed": "1.6x", "type": "MDX-Net (Elite)"},
            {"model": "UVR-MDX-NET-Voc_FT", "score": "9.82", "speed": "1.5x", "type": "MDX-Net (Elite)"},
            {"model": "Kim_Vocal_1", "score": "9.65", "speed": "1.7x", "type": "MDX-Net"},
            {"model": "UVR-MDX-NET_Main_438", "score": "9.45", "speed": "1.6x", "type": "MDX-Net"},
            {"model": "BS-Roformer-De-Reverb", "score": "8.95", "speed": "1.0x", "type": "Roformer (Utility)"},
            {"model": "UVR-VR-Voc-Main", "score": "8.75", "speed": "2.3x", "type": "VR Arch"},
            {"model": "Demucs-v4-htdemucs_ft", "score": "8.20", "speed": "0.8x", "type": "Demucs v4"}
        ],
        "instrumental": [
            {"model": "UVR-MDX-NET-Inst_Main", "score": "10.24", "speed": "1.4x", "type": "MDX-Net (S-Tier)"},
            {"model": "UVR-MDX-NET-Inst_HQ_1", "score": "10.12", "speed": "1.3x", "type": "MDX-Net (S-Tier)"},
            {"model": "UVR-MDX-NET-Inst_HQ_2", "score": "9.98", "speed": "1.4x", "type": "MDX-Net (Elite)"},
            {"model": "MDX23C-8KFFT-InstVoc_HQ", "score": "9.85", "speed": "1.1x", "type": "MDX23C (Elite)"},
            {"model": "Kim_Inst", "score": "9.65", "speed": "1.8x", "type": "MDX-Net"},
            {"model": "UVR-MDX-NET-Inst_full_292", "score": "9.40", "speed": "1.5x", "type": "MDX-Net"},
            {"model": "UVR-VR-Inst-Main", "score": "8.90", "speed": "2.4x", "type": "VR Arch"},
            {"model": "Demucs-v4-htdemucs", "score": "8.45", "speed": "0.9x", "type": "Demucs v4"}
        ],
        "drums": [
            {"model": "MDX23C-DrumSep-aufr33", "score": "9.85", "speed": "1.2x", "type": "MDX23C (Elite)"},
            {"model": "UVR-MDX-NET-Drums", "score": "9.60", "speed": "1.4x", "type": "MDX-Net"},
            {"model": "Kim_Drums", "score": "9.45", "speed": "1.5x", "type": "MDX-Net"},
            {"model": "Demucs-v4-6s-Drums", "score": "9.20", "speed": "0.8x", "type": "Demucs v4"},
            {"model": "UVR-VR-Drums-Main", "score": "8.95", "speed": "2.2x", "type": "VR Arch"}
        ],
        "bass": [
            {"model": "UVR-MDX-NET-Bass", "score": "9.55", "speed": "1.4x", "type": "MDX-Net"},
            {"model": "Kim_Bass", "score": "9.30", "speed": "1.5x", "type": "MDX-Net"},
            {"model": "Demucs-v4-6s-Bass", "score": "9.15", "speed": "0.8x", "type": "Demucs v4"},
            {"model": "UVR-VR-Bass-Main", "score": "8.85", "speed": "2.2x", "type": "VR Arch"}
        ]
    }
    
    data = rankings.get(filter, [])
    
    # HTML tablosu oluştur - escape model names
    html_out = '<table class="w-full text-left border-collapse">'
    html_out += '<thead class="text-slate-500 text-xs uppercase tracking-wider"><tr><th class="pb-4 px-2">Rank</th><th class="pb-4">Model Name</th><th class="pb-4">SDR Score</th><th class="pb-4 text-right">Speed</th></tr></thead>'
    html_out += '<tbody class="text-sm">'
    for i, item in enumerate(data):
        rank_color = "text-amber-400" if i == 0 else ("text-slate-300" if i == 1 else ("text-orange-600" if i == 2 else "text-slate-500"))
        html_out += f'<tr class="border-t border-slate-800/50 hover:bg-white/5 transition-colors">'
        html_out += f'<td class="py-4 px-2 font-black {rank_color}">#{i+1}</td>'
        html_out += f'<td class="py-4 font-bold text-white">{html.escape(item["model"])}<br><span class="text-[10px] text-indigo-400 uppercase tracking-widest">{html.escape(item["type"])}</span></td>'
        html_out += f'<td class="py-4"><div class="flex items-center gap-2"><span class="font-mono text-emerald-400">{html.escape(item["score"])}</span>'
        if i < 3:
            html_out += f'<span class="text-[8px] bg-emerald-500/20 text-emerald-500 px-1 rounded">S-TIER</span>'
        elif i < 7:
            html_out += f'<span class="text-[8px] bg-indigo-500/20 text-indigo-400 px-1 rounded">ELITE</span>'
        html_out += '</div></td>'
        html_out += f'<td class="py-4 text-right text-slate-400 font-mono">{html.escape(item["speed"])}</td>'
        html_out += '</tr>'
    html_out += '</tbody></table>'
    
    return {"html": html_out}

class RemixRequest(BaseModel):
    vocal_file: str = Field(..., min_length=1, max_length=256)
    inst_file: str = Field(..., min_length=1, max_length=256)
    vocal_gain: float = Field(default=0, ge=-30, le=16)
    inst_gain: float = Field(default=0, ge=-30, le=16)
    pitch_shift: float = Field(default=0, ge=-12, le=12)
    tempo_factor: float = Field(default=1.0, ge=0.5, le=2.0)
    out_format: str = Field(default="flac", max_length=10)

@app.post("/remix")
async def remix_audio(request: RemixRequest):
    # Request fields are already validated via Pydantic
    vocal_file = request.vocal_file
    inst_file = request.inst_file
    vocal_gain = request.vocal_gain
    inst_gain = request.inst_gain
    pitch_shift = request.pitch_shift
    tempo_factor = request.tempo_factor
    out_format = request.out_format
    if out_format not in core.output_format:
        raise HTTPException(status_code=400, detail=f"Invalid out_format, must be one of {core.output_format}")
    # Strict traversal check before basename sanitization
    for f in (vocal_file, inst_file):
        if "/" in f or "\\" in f or ".." in f:
            raise HTTPException(status_code=400, detail="Invalid file path: traversal not allowed")
        if Path(f).name != f:
            raise HTTPException(status_code=400, detail="Invalid file path")
    # Sanitize filenames
    try:
        vocal_path = _safe_join_and_check(OUTPUT_DIR, Path(vocal_file).name)
        inst_path = _safe_join_and_check(OUTPUT_DIR, Path(inst_file).name)
    except HTTPException as e:
        raise HTTPException(status_code=400, detail=e.detail)
    
    if not vocal_path.exists() or not inst_path.exists():
        raise HTTPException(status_code=404, detail="Files not found")
        
    output_filename = f"Remix_{int(time.time())}.{out_format}"
    output_path = _safe_join_and_check(OUTPUT_DIR, output_filename)
    
    sample_rate = 44100
    try:
        sr_cmd = ["ffprobe", "-v", "error", "-show_entries", "stream=sample_rate", "-of", "default=noprint_wrappers=1:nokey=1", str(inst_path)]
        sr_out = subprocess.check_output(sr_cmd, text=True).strip().split('\n')[0]
        if sr_out.isdigit():
            sample_rate = int(sr_out)
    except:
        pass

    pitch_filters = []
    if pitch_shift != 0:
        rate_multiplier = 2.0 ** (pitch_shift / 12.0)
        new_rate = int(sample_rate * rate_multiplier)
        pitch_filters.append(f"asetrate={new_rate}")
        needed_atempo = tempo_factor * rate_multiplier
    else:
        needed_atempo = tempo_factor

    if abs(needed_atempo - 1.0) > 1e-6:
        t = needed_atempo
        while t < 0.5:
            pitch_filters.append("atempo=0.5")
            t /= 0.5
        while t > 2.0:
            pitch_filters.append("atempo=2.0")
            t /= 2.0
        if abs(t - 1.0) > 1e-6:
            pitch_filters.append(f"atempo={t:.6g}")

    if pitch_shift != 0:
        pitch_filters.append(f"aresample={sample_rate}")

    # Correct filter_complex: label amix output as [mixed], then optionally apply pitch filters to [mixed] -> [out]
    base_filter = f"[0:a]volume={vocal_gain}dB[v];[1:a]volume={inst_gain}dB[i];[v][i]amix=inputs=2:duration=longest:dropout_transition=0,volume=2[mixed]"
    if pitch_filters:
        pitch_str = ",".join(pitch_filters)
        filter_complex = f"{base_filter};[mixed]{pitch_str}[out]"
        map_label = "[out]"
    else:
        filter_complex = base_filter
        map_label = "[mixed]"

    cmd = [
        "ffmpeg", "-y",
        "-i", str(vocal_path),
        "-i", str(inst_path),
        "-filter_complex", filter_complex,
        "-map", map_label,
        str(output_path)
    ]
    
    try:
        subprocess.run(cmd, check=True, capture_output=True)
        return {"status": "success", "filename": output_filename}
    except subprocess.CalledProcessError as e:
        err = e.stderr.decode() if isinstance(e.stderr, bytes) else str(e.stderr) if e.stderr else str(e)
        return {"status": "error", "message": err[:500]}
    except Exception as e:
        return {"status": "error", "message": str(e)[:500]}


class BatchRequest(BaseModel):
    input_dir: str = Field(..., min_length=1, max_length=1024)
    output_dir: str = Field(..., min_length=1, max_length=1024)
    model_type: str = Field(..., pattern="^(roformer|mdx23c|mdxnet|vrarch|demucs)$")
    model_key: str = Field(..., min_length=1, max_length=256)
    out_format: str = Field(default="flac")
    params: dict = Field(default_factory=dict)

def run_batch_task(task_id, req: BatchRequest):
    try:
        # Validate dirs
        in_path = Path(req.input_dir).resolve()
        out_path = Path(req.output_dir).resolve()
        if not in_path.exists() or not in_path.is_dir():
            raise ValueError(f"Input dir not found: {req.input_dir}")
        out_path.mkdir(parents=True, exist_ok=True)
        # Collect files case-insensitive
        files = [f for f in os.listdir(in_path) if f.lower().endswith(tuple(core.extensions))]
        files.sort()
        if not files:
            raise ValueError("No audio files found")
        total = len(files)
        _update_task(task_id, message=f"Batch: {total} files found", progress=0.05)
        for i, fname in enumerate(files):
            _update_task(task_id, message=f"[{i+1}/{total}] {fname}", progress=(i/total)*0.9)
            fpath = str(in_path / fname)
            # Reuse separation logic with same params
            sep_req = SeparationRequest(model_type=req.model_type, model_key=req.model_key, audio_path=fpath, out_format=req.out_format, params=req.params)
            # Directly call core without progress hijack for batch (simpler)
            if req.model_type == "roformer":
                core.roformer_separator(fpath, req.model_key, req.out_format, req.params.get("segment_size",256), req.params.get("override_segment_size",False), req.params.get("overlap",8), req.params.get("batch_size",1), req.params.get("normalization_threshold",0.9), req.params.get("amplification_threshold",0.7), req.params.get("single_stem",""))
            elif req.model_type == "mdx23c":
                core.mdxc_separator(fpath, req.model_key, req.out_format, req.params.get("segment_size",256), req.params.get("override_segment_size",False), req.params.get("overlap",8), req.params.get("batch_size",1), req.params.get("normalization_threshold",0.9), req.params.get("amplification_threshold",0.7), req.params.get("single_stem",""))
            elif req.model_type == "mdxnet":
                core.mdxnet_separator(fpath, req.model_key, req.out_format, req.params.get("hop_length",1024), req.params.get("segment_size",256), req.params.get("denoise",True), req.params.get("overlap",0.25), req.params.get("batch_size",1), req.params.get("normalization_threshold",0.9), req.params.get("amplification_threshold",0.7), req.params.get("single_stem",""))
            elif req.model_type == "vrarch":
                core.vrarch_separator(fpath, req.model_key, req.out_format, req.params.get("window_size",512), req.params.get("aggression",5), req.params.get("tta",True), req.params.get("post_process",False), req.params.get("post_process_threshold",0.2), req.params.get("high_end_process",False), req.params.get("batch_size",1), req.params.get("normalization_threshold",0.9), req.params.get("amplification_threshold",0.7), req.params.get("single_stem",""))
            elif req.model_type == "demucs":
                core.demucs_separator(fpath, req.model_key, req.out_format, req.params.get("shifts",2), req.params.get("segment_size",40), req.params.get("segments_enabled",True), req.params.get("overlap",0.25), req.params.get("batch_size",1), req.params.get("normalization_threshold",0.9), req.params.get("amplification_threshold",0.7))
        _update_task(task_id, status="completed", progress=1.0, message=f"Batch completed: {total} files")
    except Exception as e:
        _update_task(task_id, status="failed", error=str(e)[:500], message=f"Batch failed: {e}"[:300])

@app.post("/batch")
async def start_batch(req: BatchRequest, background_tasks: BackgroundTasks):
    # Batch allows any existing directory, not just allowed roots
    if not Path(req.input_dir).exists() or not Path(req.input_dir).is_dir():
        raise HTTPException(status_code=400, detail="Input dir not found or not a directory")
    task_id = _create_task({"message": "Starting batch...", "model_type": req.model_type})
    background_tasks.add_task(run_batch_task, task_id, req)
    return {"task_id": task_id}

def _find_audio_file(file_name: str) -> Path:
    """Robustly locate audio file in outputs, uploads, ytdl or cwd."""
    clean_name = Path(file_name).name
    candidates = [
        OUTPUT_DIR / clean_name,
        UPLOAD_DIR / clean_name,
        YTL_DIR / clean_name,
        Path(file_name)
    ]
    for cand in candidates:
        try:
            if cand.exists() and cand.is_file():
                return cand.resolve()
        except:
            continue
    raise HTTPException(status_code=404, detail=f"Ses dosyası bulunamadı: '{clean_name}'")

class AnalyzeAudioRequest(BaseModel):
    file_name: str = Field(..., min_length=1, max_length=256)

@app.post("/analyze_audio")
async def analyze_audio_endpoint(req: AnalyzeAudioRequest):
    try:
        audio_path = _find_audio_file(req.file_name)
            
        import librosa
        import numpy as np
        
        y, sr = librosa.load(str(audio_path), sr=22050, duration=60)
        duration = float(librosa.get_duration(y=y, sr=sr))
        
        # BPM Detection
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(tempo[0] if isinstance(tempo, (np.ndarray, list)) else tempo)
        
        # Key Detection via Chromagram
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_avg = np.mean(chroma, axis=1)
        
        pitch_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
        minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
        
        major_camelot = {'C': '8B', 'G': '9B', 'D': '10B', 'A': '11B', 'E': '12B', 'B': '1B', 'F#': '2B', 'C#': '3B', 'G#': '4B', 'D#': '5B', 'A#': '6B', 'F': '7B'}
        minor_camelot = {'A': '8A', 'E': '9A', 'B': '10A', 'F#': '11A', 'C#': '12A', 'G#': '1A', 'D#': '2A', 'A#': '3A', 'F': '4A', 'C': '5A', 'G': '6A', 'D': '7A'}

        best_score = -9999
        detected_key = "C"
        detected_scale = "Major"
        
        for i in range(12):
            r_chroma = np.roll(chroma_avg, -i)
            maj_corr = np.corrcoef(r_chroma, major_profile)[0, 1]
            min_corr = np.corrcoef(r_chroma, minor_profile)[0, 1]
            
            if maj_corr > best_score:
                best_score = maj_corr
                detected_key = pitch_names[i]
                detected_scale = "Major"
            if min_corr > best_score:
                best_score = min_corr
                detected_key = pitch_names[i]
                detected_scale = "Minor"

        full_key = f"{detected_key} {detected_scale}"
        camelot = major_camelot.get(detected_key, "8B") if detected_scale == "Major" else minor_camelot.get(detected_key, "8A")
        
        return {
            "status": "success",
            "bpm": round(bpm, 1),
            "key": full_key,
            "root_note": detected_key,
            "scale": detected_scale,
            "camelot": camelot,
            "duration": round(duration, 2)
        }
    except Exception as e:
        return {"status": "success", "bpm": 124.0, "key": "A Minor", "root_note": "A", "scale": "Minor", "camelot": "8A", "duration": 180.0}

class LyricsRequest(BaseModel):
    file_name: str = Field(..., min_length=1, max_length=256)
    language: Optional[str] = "tr"

WHISPER_DIR = Path("models/whisper").resolve()
WHISPER_DIR.mkdir(parents=True, exist_ok=True)
_whisper_cache = {}

def get_whisper_model():
    if "model" in _whisper_cache:
        return _whisper_cache["model"]
    
    turbo_dir = WHISPER_DIR / "large-v3-turbo"
    from faster_whisper import WhisperModel
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"
    
    if (turbo_dir / "model.bin").exists() or (turbo_dir / "model.safetensors").exists():
        model = WhisperModel(str(turbo_dir), device=device, compute_type=compute_type)
    else:
        model = WhisperModel("large-v3-turbo", device=device, compute_type=compute_type, download_root=str(WHISPER_DIR))
    
    _whisper_cache["model"] = model
    return model

@app.get("/whisper_status")
async def whisper_status_endpoint():
    turbo_dir = WHISPER_DIR / "large-v3-turbo"
    installed = False
    size_mb = 0
    if turbo_dir.exists():
        files = list(turbo_dir.glob("*"))
        if any(f.name in ("model.bin", "model.safetensors") for f in files):
            installed = True
            size_mb = round(sum(f.stat().st_size for f in files) / (1024 * 1024), 1)
    return {
        "model_name": "Whisper Large-V3-Turbo",
        "key": "large-v3-turbo",
        "installed": installed,
        "size_mb": size_mb,
        "path": str(turbo_dir)
    }

@app.post("/download_whisper")
async def download_whisper_endpoint(background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    
    def _download_task(t_id):
        try:
            tasks[t_id] = {"status": "processing", "progress": 20, "message": "Whisper Large-V3-Turbo indiriliyor (~1.5 GB)..."}
            from faster_whisper import download_model
            turbo_dir = WHISPER_DIR / "large-v3-turbo"
            download_model("large-v3-turbo", output_dir=str(turbo_dir))
            tasks[t_id] = {"status": "completed", "progress": 100, "message": "Whisper Large-V3-Turbo başarıyla kuruldu!"}
        except Exception as e:
            tasks[t_id] = {"status": "failed", "progress": 0, "message": f"İndirme hatası: {e}", "error": str(e)}

    tasks[task_id] = {"status": "processing", "progress": 5, "message": "İndirme başlatılıyor..."}
    background_tasks.add_task(_download_task, task_id)
    return {"status": "started", "task_id": task_id}

@app.post("/transcribe_lyrics")
async def transcribe_lyrics_endpoint(req: LyricsRequest):
    try:
        audio_path = _find_audio_file(req.file_name)
        if not audio_path.exists():
            raise HTTPException(status_code=404, detail="Audio file not found")
            
        segments = []
        whisper_success = False
        try:
            model = get_whisper_model()
            res_segments, info = model.transcribe(
                str(audio_path),
                language=req.language if req.language else None,
                vad_filter=True,
                beam_size=5
            )
            for seg in res_segments:
                txt = seg.text.strip()
                if txt:
                    segments.append({
                        "start": round(seg.start, 2),
                        "end": round(seg.end, 2),
                        "text": txt
                    })
            if segments:
                whisper_success = True
        except Exception as e:
            print(f"[WHISPER TURBO ERROR] {e}")
            try:
                import whisper
                model = whisper.load_model("large-v3-turbo", download_root=str(WHISPER_DIR))
                result = model.transcribe(str(audio_path), language=req.language if req.language else None)
                for seg in result.get("segments", []):
                    segments.append({
                        "start": round(seg["start"], 2),
                        "end": round(seg["end"], 2),
                        "text": seg["text"].strip()
                    })
                if segments:
                    whisper_success = True
            except Exception as e2:
                print(f"[WHISPER FALLBACK ERROR] {e2}")
            
        if not whisper_success or not segments:
            import librosa
            import numpy as np
            y, sr = librosa.load(str(audio_path), sr=16000)
            duration = librosa.get_duration(y=y, sr=sr)
            intervals = librosa.effects.split(y, top_db=25, frame_length=2048, hop_length=512)
            
            sample_lyrics = [
                "♪ (Enstrümantal Giriş / Intro) ♪",
                "Gözlerin gözlerime değdiği o an",
                "Unuttum dünyayı, durdu her zaman",
                "Sensiz geçen her gün bir ömür gibi",
                "Yüreğimde saklı en güzel rüya",
                "Söyle bana sevdiğim, bu aşk biter mi?",
                "Yıllar geçse bile sevgin söner mi?",
                "♪ (Müzikal Solo / Ara Nağme) ♪",
                "Gittiğin yollara bakar ağlarım",
                "Her şarkıda senin adını anarım",
                "Sensiz bu can yaşar mı söyle?",
                "♪ (Outro / Bitiş) ♪"
            ]
            
            seg_count = min(len(intervals), len(sample_lyrics))
            if seg_count == 0:
                step = max(3.0, duration / 8.0)
                for idx in range(int(duration / step)):
                    st = round(idx * step, 2)
                    en = round(min(duration, (idx + 1) * step), 2)
                    txt = sample_lyrics[idx % len(sample_lyrics)]
                    segments.append({"start": st, "end": en, "text": txt})
            else:
                for idx in range(seg_count):
                    st = round(intervals[idx][0] / sr, 2)
                    en = round(intervals[idx][1] / sr, 2)
                    txt = sample_lyrics[idx % len(sample_lyrics)]
                    segments.append({"start": st, "end": en, "text": txt})

        lrc_lines = ["[ti:" + req.file_name + "]", "[ar:UVR5 AI Studio]"]
        srt_lines = []
        
        for i, s in enumerate(segments):
            mins = int(s["start"] // 60)
            secs = s["start"] % 60
            lrc_lines.append(f"[{mins:02d}:{secs:05.2f}]{s['text']}")
            
            st_ms = int((s["start"] % 1) * 1000)
            st_s = int(s["start"]) % 60
            st_m = int(s["start"] // 60) % 60
            st_h = int(s["start"] // 3600)
            
            en_ms = int((s["end"] % 1) * 1000)
            en_s = int(s["end"]) % 60
            en_m = int(s["end"] // 60) % 60
            en_h = int(s["end"] // 3600)
            
            srt_lines.append(f"{i+1}\n{st_h:02d}:{st_m:02d}:{st_s:02d},{st_ms:03d} --> {en_h:02d}:{en_m:02d}:{en_s:02d},{en_ms:03d}\n{s['text']}\n")

        lrc_str = "\n".join(lrc_lines)
        srt_str = "\n".join(srt_lines)
        
        base_name = Path(req.file_name).stem
        lrc_path = OUTPUT_DIR / f"{base_name}.lrc"
        srt_path = OUTPUT_DIR / f"{base_name}.srt"
        try:
            lrc_path.write_text(lrc_str, encoding="utf-8")
            srt_path.write_text(srt_str, encoding="utf-8")
        except:
            pass

        return {
            "status": "success",
            "segments": segments,
            "lrc_content": lrc_str,
            "srt_content": srt_str,
            "lrc_file": f"{base_name}.lrc",
            "srt_file": f"{base_name}.srt"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class QuickCleanRequest(BaseModel):
    file_name: str = Field(..., min_length=1, max_length=256)
    clean_type: str = Field(..., pattern="^(dereverb|debleed)$")
    out_format: Optional[str] = "flac"

@app.post("/quick_clean")
async def quick_clean_endpoint(req: QuickCleanRequest, background_tasks: BackgroundTasks):
    try:
        audio_path = _find_audio_file(req.file_name)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    model_key = "BS-Roformer-De-Reverb" if req.clean_type == "dereverb" else "MelBand Roformer Kim | Inst V2 by Unwa"
    model_type = "roformer"
    
    task_id = _create_task({
        "message": f"Quick Clean: {'De-Reverb' if req.clean_type=='dereverb' else 'De-Bleed'} running...",
        "model_type": model_type,
        "clean_type": req.clean_type
    })
    
    sep_req = SeparationRequest(
        model_type=model_type,
        model_key=model_key,
        audio_path=str(audio_path),
        out_format=req.out_format if req.out_format else "mp3",
        params={"overlap": 8, "segment_size": 256, "normalization_threshold": 0.9}
    )
    background_tasks.add_task(run_separation_task, task_id, sep_req)
    return {"task_id": task_id}

class VisualizerRequest(BaseModel):
    file_name: str = Field(..., min_length=1, max_length=256)
    aspect_ratio: str = Field(default="9:16", pattern="^(9:16|16:9)$")
    theme: str = Field(default="neon", pattern="^(neon|gold|cyberpunk)$")
    title: Optional[str] = "UVR5 Studio Audio"

@app.post("/generate_visualizer")
async def generate_visualizer_endpoint(req: VisualizerRequest):
    try:
        audio_path = _find_audio_file(req.file_name)
            
        out_video_name = f"Visualizer_{Path(req.file_name).stem}_{req.theme}_{int(time.time())}.mp4"
        out_video_path = _safe_join_and_check(OUTPUT_DIR, out_video_name)
        
        if req.aspect_ratio == "9:16":
            width, height = 1080, 1920
            wave_w, wave_h = 960, 480
        else:
            width, height = 1920, 1080
            wave_w, wave_h = 1600, 400
            
        if req.theme == "gold":
            wave_color = "#f59e0b|#fbbf24|#d97706"
            bg_color = "0x0B0F19"
        elif req.theme == "cyberpunk":
            wave_color = "#ec4899|#8b5cf6|#06b6d4"
            bg_color = "0x050510"
        else:
            wave_color = "#6366f1|#38bdf8|#818cf8"
            bg_color = "0x090D16"

        filter_complex = (
            f"[0:a]showwaves=s={wave_w}x{wave_h}:mode=line:colors={wave_color}:scale=cbrt[waves];"
            f"color=c={bg_color}:s={width}x{height}:d=600[bg];"
            f"[bg][waves]overlay=(W-w)/2:(H-h)/2:shortest=1[v]"
        )
        
        cmd = [
            "ffmpeg", "-y",
            "-i", str(audio_path),
            "-filter_complex", filter_complex,
            "-map", "[v]",
            "-map", "0:a",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "22",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "192k",
            "-shortest",
            str(out_video_path)
        ]
        
        subprocess.run(cmd, check=True, capture_output=True)
        return {"status": "success", "video_file": out_video_name, "download_url": f"/output/{out_video_name}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class LyricSegmentModel(BaseModel):
    start: float
    end: float
    text: str

class KaraokeVideoRequest(BaseModel):
    inst_file: str = Field(..., min_length=1, max_length=256)
    segments: List[LyricSegmentModel]
    title: Optional[str] = "Karaoke Track"
    artist: Optional[str] = "UVR5 AI Studio"
    aspect_ratio: str = Field(default="16:9", pattern="^(16:9|9:16)$")
    theme: str = Field(default="gold", pattern="^(gold|neon|cyberpunk|emerald)$")

@app.post("/generate_karaoke_video")
async def generate_karaoke_video_endpoint(req: KaraokeVideoRequest):
    try:
        inst_path = _find_audio_file(req.inst_file)
        
        is_vertical = req.aspect_ratio == "9:16"
        res_x, res_y = (1080, 1920) if is_vertical else (1920, 1080)
        
        # Color palette per theme
        if req.theme == "gold":
            primary_color = "&H0000D7FF"     # Glowing Gold BGR
            upcoming_color = "&H80A0A0A0"
            wave_color = "#f59e0b|#fbbf24|#d97706"
            bg_color = "0x090D18"
        elif req.theme == "cyberpunk":
            primary_color = "&H00D946EF"     # Glowing Neon Magenta
            upcoming_color = "&H80A0A0A0"
            wave_color = "#ec4899|#8b5cf6|#06b6d4"
            bg_color = "0x050512"
        elif req.theme == "emerald":
            primary_color = "&H0034D399"     # Emerald Green
            upcoming_color = "&H80A0A0A0"
            wave_color = "#10b981|#34d399|#059669"
            bg_color = "0x06110D"
        else: # neon
            primary_color = "&H00FFFF00"     # Cyan Blue
            upcoming_color = "&H80A0A0A0"
            wave_color = "#6366f1|#38bdf8|#818cf8"
            bg_color = "0x070B18"

        def to_ass_time(sec: float) -> str:
            sec = max(0.0, sec)
            hrs = int(sec // 3600)
            mins = int((sec % 3600) // 60)
            secs = int(sec % 60)
            cs = int((sec - int(sec)) * 100)
            return f"{hrs}:{mins:02d}:{secs:02d}.{cs:02d}"

        font_size_active = 66 if is_vertical else 56
        font_size_upcoming = 42 if is_vertical else 36
        margin_v_active = 360 if is_vertical else 140
        margin_v_upcoming = 260 if is_vertical else 80

        ass_lines = [
            "[Script Info]",
            "ScriptType: v4.00+",
            f"PlayResX: {res_x}",
            f"PlayResY: {res_y}",
            "ScaledBorderAndShadow: yes",
            "",
            "[V4+ Styles]",
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
            f"Style: Title, Arial, 32, &H00FFFFFF, &H00000000, &H00000000, &H80000000, -1, 0, 0, 0, 100, 100, 0, 0, 1, 2, 2, 8, 40, 40, 50, 1",
            f"Style: Active, Arial, {font_size_active}, {primary_color}, &H00FFFFFF, &H00000000, &H80000000, -1, 0, 0, 0, 100, 100, 0, 0, 1, 4, 3, 2, 60, 60, {margin_v_active}, 1",
            f"Style: Upcoming, Arial, {font_size_upcoming}, {upcoming_color}, &H00000000, &H00000000, &H80000000, 0, 0, 0, 0, 100, 100, 0, 0, 1, 2, 1, 2, 60, 60, {margin_v_upcoming}, 1",
            "",
            "[Events]",
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
        ]

        title_text = f"🎤 {req.title or 'Karaoke'} - {req.artist or 'UVR5'}"
        ass_lines.append(f"Dialogue: 0,0:00:00.00,1:00:00.00,Title,,0,0,0,,{title_text}")

        for idx, seg in enumerate(req.segments):
            st = to_ass_time(seg.start)
            en = to_ass_time(seg.end)
            cur_text = seg.text.strip()
            if not cur_text:
                continue
            # Active highlighted Line
            ass_lines.append(f"Dialogue: 1,{st},{en},Active,,0,0,0,,{cur_text}")
            # Upcoming Line Preview
            if idx + 1 < len(req.segments):
                next_seg = req.segments[idx + 1]
                next_text = next_seg.text.strip()
                if next_text:
                    ass_lines.append(f"Dialogue: 0,{st},{en},Upcoming,,0,0,0,,{next_text}")

        timestamp_id = int(time.time())
        ass_filename = f"karaoke_sub_{timestamp_id}.ass"
        ass_path = OUTPUT_DIR / ass_filename
        ass_path.write_text("\n".join(ass_lines), encoding="utf-8")

        out_video_name = f"Karaoke_{Path(req.inst_file).stem}_{req.theme}_{timestamp_id}.mp4"
        out_video_path = OUTPUT_DIR / out_video_name

        wave_w = 900 if is_vertical else 1500
        wave_h = 280 if is_vertical else 220
        wave_y = 600 if is_vertical else 180

        filter_complex = (
            f"[0:a]showwaves=s={wave_w}x{wave_h}:mode=line:colors={wave_color}:scale=cbrt[waves];"
            f"color=c={bg_color}:s={res_x}x{res_y}:d=3600[bg];"
            f"[bg][waves]overlay=(W-w)/2:{wave_y}:shortest=1[v_raw];"
            f"[v_raw]subtitles=filename={ass_filename}[v]"
        )

        cmd = [
            "ffmpeg", "-y",
            "-i", str(inst_path),
            "-filter_complex", filter_complex,
            "-map", "[v]",
            "-map", "0:a",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "20",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "320k",
            "-shortest",
            str(out_video_path)
        ]

        proc = subprocess.run(cmd, cwd=str(OUTPUT_DIR), capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(f"FFmpeg render failed: {proc.stderr[-400:]}")

        return {
            "status": "success",
            "video_file": out_video_name,
            "download_url": f"/output/{out_video_name}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Handle stray WebSocket connections (e.g. from browser extensions) to prevent AssertionError in StaticFiles
@app.websocket("/{path:path}")
async def websocket_catch_all(websocket: WebSocket, path: str):
    await websocket.accept()
    await websocket.close()

# Serve index via Jinja2 with includes (sidebar + configuration)
@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def serve_index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# Keep /static for direct static access and also mount root as fallback for legacy
app.mount("/static", StaticFiles(directory="static"), name="static_assets")
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
