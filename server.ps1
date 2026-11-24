# Server Lokal Windows (Zero Installation Fallback)
param(
    [int]$Port = 8080
)

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Host "[ERROR] Port $Port sedang digunakan. Mencoba port 8081..." -ForegroundColor Yellow
    $Port = 8081
    $prefix = "http://localhost:$Port/"
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add($prefix)
    $listener.Start()
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  SERVER LOKAL CAT ASSESSMENT SYSTEM CASN AKTIF" -ForegroundColor Green
Write-Host "  URL: $prefix" -ForegroundColor Yellow
Write-Host "  (Tanpa install apa-apa, menggunakan Windows PowerShell)" -ForegroundColor Gray
Write-Host "  Tekan Ctrl + C di jendela ini untuk menghentikan server." -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

# Buka browser otomatis
Start-Process "http://localhost:$Port/index.html"

$mimes = @{
    '.html'   = 'text/html; charset=utf-8'
    '.htm'    = 'text/html; charset=utf-8'
    '.css'    = 'text/css; charset=utf-8'
    '.js'     = 'application/javascript; charset=utf-8'
    '.wasm'   = 'application/wasm'
    '.json'   = 'application/json; charset=utf-8'
    '.sqlite' = 'application/x-sqlite3'
    '.svg'    = 'image/svg+xml'
    '.png'    = 'image/png'
    '.jpg'    = 'image/jpeg'
    '.jpeg'   = 'image/jpeg'
    '.ico'    = 'image/x-icon'
}

$root = (Get-Item $PSScriptRoot).FullName
$rateLimitFile = Join-Path $env:LOCALAPPDATA 'cat_skd_server_ratelimit.json'
$expectedHash = '82f5bacfb16f052a221735719214613fa29d3110c5295ff5ba38195267d387bd'
$maxAttempts = 5
$cooldownSeconds = 300

function Get-RateLimitState {
    $state = @{ failCount = 0; lockoutUntil = 0 }
    if ([System.IO.File]::Exists($rateLimitFile)) {
        try {
            $raw = [System.IO.File]::ReadAllText($rateLimitFile) | ConvertFrom-Json
            $state.failCount = [int]$raw.failCount
            $state.lockoutUntil = [long]$raw.lockoutUntil
        } catch {}
    }
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    if ($state.lockoutUntil -gt 0 -and $now -ge $state.lockoutUntil) {
        $state.failCount = 0
        $state.lockoutUntil = 0
        Save-RateLimitState $state
    }
    return $state
}

function Save-RateLimitState($state) {
    try {
        $json = @{ failCount = $state.failCount; lockoutUntil = $state.lockoutUntil } | ConvertTo-Json -Compress
        [System.IO.File]::WriteAllText($rateLimitFile, $json)
    } catch {}
}

function Send-JsonResponse($res, $statusCode, $obj) {
    $json = $obj | ConvertTo-Json -Compress
    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
    $res.StatusCode = $statusCode
    $res.ContentType = 'application/json; charset=utf-8'
    $res.ContentLength64 = $buf.Length
    $res.AddHeader('Cache-Control', 'no-store')
    $res.OutputStream.Write($buf, 0, $buf.Length)
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $relPath = [System.Uri]::UnescapeDataString($request.Url.LocalPath).TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($relPath)) {
            $relPath = 'index.html'
        }

        # Endpoint: GET /api/auth-status
        if ($relPath -eq 'api/auth-status' -and $request.HttpMethod -eq 'GET') {
            $rl = Get-RateLimitState
            $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
            $remSec = if ($rl.lockoutUntil -gt $now) { [int]($rl.lockoutUntil - $now) } else { 0 }
            Send-JsonResponse $response 200 @{
                serverEnforced = $true
                locked = ($remSec -gt 0)
                failCount = $rl.failCount
                remainingAttempts = [Math]::Max(0, $maxAttempts - $rl.failCount)
                lockoutSeconds = $remSec
            }
            $response.Close()
            continue
        }

        # Endpoint: POST /api/auth
        if ($relPath -eq 'api/auth' -and $request.HttpMethod -eq 'POST') {
            $rl = Get-RateLimitState
            $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
            if ($rl.lockoutUntil -gt $now) {
                $remSec = [int]($rl.lockoutUntil - $now)
                Send-JsonResponse $response 429 @{
                    ok = $false
                    serverEnforced = $true
                    locked = $true
                    failCount = $rl.failCount
                    remainingAttempts = 0
                    lockoutSeconds = $remSec
                }
                $response.Close()
                continue
            }

            $reader = New-Object System.IO.StreamReader($request.InputStream, $request.ContentEncoding)
            $body = $reader.ReadToEnd()
            $reader.Close()
            $submittedHash = ''
            try {
                $parsed = $body | ConvertFrom-Json
                $submittedHash = [string]$parsed.hash
            } catch {}

            if ($submittedHash -eq $expectedHash) {
                $rl.failCount = 0
                $rl.lockoutUntil = 0
                Save-RateLimitState $rl
                Send-JsonResponse $response 200 @{
                    ok = $true
                    serverEnforced = $true
                    locked = $false
                }
            } else {
                $rl.failCount = $rl.failCount + 1
                if ($rl.failCount -ge $maxAttempts) {
                    $rl.lockoutUntil = $now + $cooldownSeconds
                    Save-RateLimitState $rl
                    Send-JsonResponse $response 429 @{
                        ok = $false
                        serverEnforced = $true
                        locked = $true
                        failCount = $rl.failCount
                        remainingAttempts = 0
                        lockoutSeconds = $cooldownSeconds
                    }
                } else {
                    Save-RateLimitState $rl
                    Send-JsonResponse $response 401 @{
                        ok = $false
                        serverEnforced = $true
                        locked = $false
                        failCount = $rl.failCount
                        remainingAttempts = ($maxAttempts - $rl.failCount)
                        lockoutSeconds = 0
                    }
                }
            }
            $response.Close()
            continue
        }

        $fullPath = [System.IO.Path]::GetFullPath((Join-Path $root $relPath))

        # Security check: cegah path traversal, akses direktori, atau file server/skrip
        if (-not $fullPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -or
            [System.IO.Directory]::Exists($fullPath) -or
            $relPath -match '(?i)(^|/)(server\.ps1|.*\.bat|\.htaccess|\.ratelimit\.json)$') {
            $response.StatusCode = 403
            $msg = [System.Text.Encoding]::UTF8.GetBytes("403 Forbidden - Akses ditolak")
            $response.ContentType = 'text/plain; charset=utf-8'
            $response.ContentLength64 = $msg.Length
            $response.OutputStream.Write($msg, 0, $msg.Length)
            $response.Close()
            continue
        }

        if ([System.IO.File]::Exists($fullPath)) {
            $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
            $mime = if ($mimes.ContainsKey($ext)) { $mimes[$ext] } else { 'application/octet-stream' }

            $bytes = [System.IO.File]::ReadAllBytes($fullPath)
            $response.ContentType = $mime
            $response.ContentLength64 = $bytes.Length
            $response.AddHeader('Access-Control-Allow-Origin', '*')
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - Berkas Tidak Ditemukan: $relPath")
            $response.ContentType = 'text/plain; charset=utf-8'
            $response.ContentLength64 = $msg.Length
            $response.OutputStream.Write($msg, 0, $msg.Length)
        }

        $response.Close()
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
