@echo off
setlocal enabledelayedexpansion
title Server Lokal - CAT Assessment CASN
cd /d "%~dp0"

set PORT=8080

echo =====================================================================
echo           MEMULAI SERVER LOKAL CAT ASSESSMENT SYSTEM CASN
echo =====================================================================
echo.
echo  [INFO] Menyiapkan server lokal di: http://localhost:%PORT%/index.html
echo  [INFO] Tidak perlu install aplikasi tambahan apapun (Zero Install)!
echo.

:: 1. Cek apakah Python tersedia
where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo  [OK] Menggunakan engine: Python HTTP Server
    echo  [OK] Membuka browser otomatis...
    start "" "http://localhost:%PORT%/index.html"
    echo.
    echo  Server aktif! Tekan Ctrl + C di jendela ini untuk menghentikan.
    echo ---------------------------------------------------------------------
    python -m http.server %PORT%
    goto :end
)

:: 2. Cek apakah PHP tersedia
where php >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo  [OK] Menggunakan engine: PHP Built-in Server
    echo  [OK] Membuka browser otomatis...
    start "" "http://localhost:%PORT%/index.html"
    echo.
    echo  Server aktif! Tekan Ctrl + C di jendela ini untuk menghentikan.
    echo ---------------------------------------------------------------------
    php -S localhost:%PORT%
    goto :end
)

:: 3. Menggunakan Windows PowerShell bawaan (100% ada di semua Windows tanpa install)
echo  [OK] Menggunakan engine: Windows PowerShell Native Server (Bawaan Windows)
echo  [OK] Membuka browser otomatis...
echo.
echo  Server aktif! Tekan Ctrl + C di jendela ini untuk menghentikan.
echo ---------------------------------------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port %PORT%

:end
pause
