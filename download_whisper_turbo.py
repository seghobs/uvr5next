import os
import sys
import time
from pathlib import Path

def download_whisper_turbo():
    print("=" * 65)
    print("   UVR5 Studio - Whisper Large-V3-Turbo Model Downloader")
    print("=" * 65)
    print("\n[1/3] Whisper modülü kontrol ediliyor...")

    models_dir = Path("models/whisper").resolve()
    models_dir.mkdir(parents=True, exist_ok=True)
    target_dir = models_dir / "large-v3-turbo"

    try:
        from faster_whisper import download_model
        print(f"[2/3] 'large-v3-turbo' modeli indiriliyor -> {target_dir}...")
        print("      (Boyut: ~1.5 GB - Lütfen bekleyin...)\n")
        
        start_time = time.time()
        downloaded_path = download_model("large-v3-turbo", output_dir=str(target_dir))
        elapsed = round(time.time() - start_time, 1)

        print(f"\n[3/3] Başarıyla Tamamlandı! ({elapsed} saniye)")
        print(f"      Model Konumu: {downloaded_path}")
        print("=" * 65)
        print("Whisper Large-V3-Turbo modeli stüdyonuza başarıyla kuruldu!")
        print("=" * 65)
    except Exception as e:
        print(f"\n[HATA] faster_whisper indirme hatası: {e}")
        print("Alternatif olarak standart whisper deneniyor...")
        try:
            import whisper
            whisper.load_model("large-v3-turbo", download_root=str(models_dir))
            print("\n[BAŞARILI] Standart Whisper Large-V3-Turbo indirildi!")
        except Exception as e2:
            print(f"[HATA] Standart indirme de başarısız: {e2}")

if __name__ == "__main__":
    download_whisper_turbo()
