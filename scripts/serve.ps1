# Minimal static file server for local preview.
# ES modules require a real origin, so file:// will not do.
param(
  # Defaults to the project root (this script lives in <root>/scripts).
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  # 0 = resolve automatically (see below). An explicit -Port always wins, so
  # share.ps1 and any manual run keep full control.
  [int]$Port = 0
)

$ErrorActionPreference = 'Stop'

# Port precedence, high to low:
#   1. an explicit -Port argument
#   2. $env:PORT — set by the editor's preview launcher under "autoPort": true,
#      so it can hand us a free port instead of a fixed one that may be taken
#   3. 8124 — the standing fallback (8123 was lost to a Windows port exclusion
#      plus a stranded HTTP.sys registration and cannot be bound without admin)
if ($Port -eq 0) {
  if ($env:PORT -match '^\d+$') { $Port = [int]$env:PORT } else { $Port = 8124 }
}

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.webp' = 'image/webp'
  '.ico'  = 'image/x-icon'
  '.woff' = 'font/woff'
  '.woff2'= 'font/woff2'
  '.md'   = 'text/plain; charset=utf-8'
  '.mp3'  = 'audio/mpeg'
  '.wav'  = 'audio/wav'
  '.ogg'  = 'audio/ogg'
  '.m4a'  = 'audio/mp4'
  '.aac'  = 'audio/aac'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "serving $Root on http://localhost:$Port/"

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
  } catch { break }

  $req = $ctx.Request
  $res = $ctx.Response

  try {
    $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
    $path = Join-Path $Root $rel

    # Keep the server inside the project root. GetFullPath resolves any ".."
    # in the request; the trailing separator on the root matters, because a
    # bare prefix test would let "<root>-secrets" satisfy a root of "<root>".
    $full = [System.IO.Path]::GetFullPath($path)
    $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/') +
                [System.IO.Path]::DirectorySeparatorChar
    if (-not $full.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
      $res.StatusCode = 403; $res.Close(); continue
    }

    # Serve the site only. Dotfiles and the tooling directories (.claude, .git),
    # plus the non-deployed working folders: design/ holds the 2 MB master
    # artwork and scripts/ is build tooling — neither belongs on a public URL.
    if ($rel -match '(^|[\\/])\.' -or $rel -match '^(design|scripts|tools)([\\/]|$)') {
      $res.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes('404 not found')
      $res.OutputStream.Write($msg, 0, $msg.Length)
      $res.Close(); continue
    }

    if (Test-Path -LiteralPath $full -PathType Container) {
      $full = Join-Path $full 'index.html'
    }

    if (Test-Path -LiteralPath $full -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
      $ct = $mime[$ext]
      if (-not $ct) { $ct = 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $res.ContentType = $ct
      $res.Headers.Add('Cache-Control', 'no-store')
      $res.Headers.Add('Accept-Ranges', 'bytes')
      $res.ContentLength64 = $bytes.Length
      # A HEAD must carry the headers but no body — writing one makes
      # HttpListener fail the request with a 500.
      if ($req.HttpMethod -ne 'HEAD') {
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      }
      Write-Host "$($req.HttpMethod) 200 $rel"
    } else {
      $res.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 not found: $rel")
      $res.OutputStream.Write($msg, 0, $msg.Length)
      Write-Host "404 $rel"
    }
  } catch {
    Write-Host "500 $($_.Exception.Message)"
    try { $res.StatusCode = 500 } catch {}
  } finally {
    try { $res.Close() } catch {}
  }
}
