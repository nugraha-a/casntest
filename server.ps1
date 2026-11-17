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

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $relPath = [System.Uri]::UnescapeDataString($request.Url.LocalPath).TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($relPath)) {
            $relPath = 'index.html'
        }

        $fullPath = [System.IO.Path]::GetFullPath((Join-Path $root $relPath))

        # Security check: cegah path traversal
        if (-not $fullPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
            $response.StatusCode = 403
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
