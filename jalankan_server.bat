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

:: Jalankan Windows PowerShell Server (Mendukung Rate Limiter Server-Side Anti-Bypass)
echo  [OK] Menggunakan engine: Windows PowerShell Server (Server-Side Rate Limiter Aktif)
echo  [OK] Membuka browser otomatis...
echo.
echo  Server aktif! Tekan Ctrl + C di jendela ini untuk menghentikan.
echo ---------------------------------------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port %PORT%

:end
pause
