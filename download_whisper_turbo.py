import os
import sys
import time
from pathlib import Path

def download_whisper_turbo():
    print("=" * 65)
    print("   UVR5 Studio - Whisper Large-V3-Turbo Model Downloader")
    print("=" * 65)
    print("\n[1/2] Whisper Large-V3-Turbo (~1.5 GB) indiriliyor...")

    models_dir = Path("models/whisper").resolve()
    models_dir.mkdir(parents=True, exist_ok=True)
    target_dir = models_dir / "large-v3-turbo"

    start_time = time.time()
    try:
        from huggingface_hub import snapshot_download
        print(f"      Hedef Klasör: {target_dir}")
        print("      Lütfen bekleyin (İndirme hızı internetinize bağlıdır)...\n")
        
        snapshot_download(
            repo_id="deepdml/faster-whisper-large-v3-turbo-ct2",
            local_dir=str(target_dir),
            local_dir_use_symlinks=False,
            resume_download=True
        )
        elapsed = round(time.time() - start_time, 1)
        print(f"\n[2/2] Başarıyla Tamamlandı! ({elapsed} saniye)")
        print(f"      Model Konumu: {target_dir}")
        print("=" * 65)
        print("Whisper Large-V3-Turbo modeli stüdyonuza başarıyla kuruldu!")
        print("=" * 65)
    except Exception as e:
        print(f"\n[HATA] İndirme hatası: {e}")

if __name__ == "__main__":
    download_whisper_turbo()
