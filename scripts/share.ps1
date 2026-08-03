# Puts the site on a public HTTPS URL for a client review.
#
#   Double-click  scripts\share.cmd   (or run this file)
#
# Starts the local static server, opens a Cloudflare quick tunnel, and prints
# the link. Keep the window open for as long as you need the link to work —
# closing it stops both. The URL is new every run; quick tunnels are temporary.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$port = 8124
$tools = Join-Path $root 'tools'
$exe = Join-Path $tools 'cloudflared.exe'

Write-Host ''
Write-Host '  Azhar Islamic Ruqyah Centre - share for review' -ForegroundColor Yellow
Write-Host '  ---------------------------------------------'
Write-Host ''

# --- cloudflared: fetch once, reuse thereafter -------------------------------
if (-not (Test-Path $exe)) {
  New-Item -ItemType Directory -Force -Path $tools | Out-Null
  Write-Host '  Downloading cloudflared (~54 MB, one time)...' -ForegroundColor Cyan
  $ProgressPreference = 'SilentlyContinue'
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest `
    -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' `
    -OutFile $exe -UseBasicParsing -TimeoutSec 600
  Write-Host '  Done.' -ForegroundColor Green
}

# --- local server ------------------------------------------------------------
$busy = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
if ($busy) {
  Write-Host "  Port $port already in use - reusing whatever is serving it." -ForegroundColor DarkYellow
  $server = $null
} else {
  $server = Start-Process powershell `
    -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$(Join-Path $PSScriptRoot 'serve.ps1')`"",'-Port',"$port" `
    -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 3
}

try {
  $probe = Invoke-WebRequest "http://localhost:$port/" -UseBasicParsing -TimeoutSec 10
  Write-Host "  Local site OK  (http://localhost:$port/  $('{0:N0}' -f $probe.RawContentLength) bytes)" -ForegroundColor Green
} catch {
  Write-Host '  Local server did not start. Aborting.' -ForegroundColor Red
  if ($server) { Stop-Process -Id $server.Id -ErrorAction SilentlyContinue }
  Read-Host '  Press Enter to close'
  exit 1
}

# --- tunnel ------------------------------------------------------------------
# --http-host-header is required: the local server matches on the Host header,
# and cloudflared otherwise forwards the public hostname, which fails every
# request with 400.
Write-Host '  Opening public tunnel...' -ForegroundColor Cyan
$log = Join-Path $env:TEMP ("cf-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".log")
$tunnel = Start-Process $exe `
  -ArgumentList 'tunnel','--url',"http://localhost:$port",'--http-host-header',"localhost:$port",'--no-autoupdate' `
  -RedirectStandardError $log -RedirectStandardOutput ($log + '.out') -WindowStyle Hidden -PassThru

$url = $null
for ($i = 0; $i -lt 40 -and -not $url; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $log) {
    $m = [regex]::Match((Get-Content $log -Raw -ErrorAction SilentlyContinue), 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($m.Success) { $url = $m.Value }
  }
}

Write-Host ''
if ($url) {
  Write-Host '  ============================================================'
  Write-Host "   $url" -ForegroundColor Yellow
  Write-Host '  ============================================================'
  Write-Host ''
  Write-Host '  Send that link to your client.' -ForegroundColor Green
  Write-Host '  It works only while this window stays open and the PC is awake.'
  try { Set-Clipboard -Value $url; Write-Host '  (copied to your clipboard)' -ForegroundColor DarkGray } catch {}
} else {
  Write-Host '  Could not read the tunnel URL. Log: ' -NoNewline; Write-Host $log -ForegroundColor DarkGray
}

Write-Host ''
Read-Host '  Press Enter to stop sharing and shut everything down' | Out-Null

foreach ($p in @($tunnel, $server)) {
  if ($p) { Stop-Process -Id $p.Id -ErrorAction SilentlyContinue }
}
Write-Host '  Stopped.' -ForegroundColor DarkGray
