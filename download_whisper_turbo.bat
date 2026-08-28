@echo off
title UVR5 - Whisper Large-V3-Turbo Downloader
color 0A
echo =================================================================
echo        UVR5 Studio - Whisper Large-V3-Turbo Model Downloader
echo =================================================================
echo.
echo Bu islem ~1.5 GB boyutundaki en kaliteli ve sifir hatali
echo Whisper Large-V3-Turbo yapay zeka modelini bilgisayariniza indirecektir.
echo.
pause
python download_whisper_turbo.py
echo.
echo Islem tamamlandi! Cikmak icin bir tusa basin.
pause >nul
