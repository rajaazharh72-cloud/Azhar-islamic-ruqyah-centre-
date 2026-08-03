# Crops the logo to a transparent circle at the red ring (measured centre
# 1000,1000 r=800 in a 2000x2000 source) and emits the sizes the site needs,
# plus an Open Graph card composed on the site's midnight background.
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

# Master artwork lives outside assets/ — it is 2 MB and must never be deployed.
$src = Join-Path (Split-Path -Parent $PSScriptRoot) "design\logo-source.png"
$out = Join-Path (Split-Path -Parent $PSScriptRoot) "assets\img"
New-Item -ItemType Directory -Force -Path $out | Out-Null

$CX = 1000; $CY = 1000; $R = 800     # measured, not guessed
$srcRect = New-Object System.Drawing.Rectangle (($CX - $R), ($CY - $R), (2*$R), (2*$R))

$source = [System.Drawing.Bitmap]::FromFile($src)

function Save-Png([System.Drawing.Bitmap]$bmp, [string]$path) {
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function New-CircleLogo([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  # Clip to a circle inset by half a pixel so the rim antialiases cleanly
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse(0.5, 0.5, $size - 1.0, $size - 1.0)
  $g.SetClip($path)
  $dest = New-Object System.Drawing.Rectangle 0, 0, $size, $size
  $g.DrawImage($source, $dest, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

  $g.Dispose(); $path.Dispose()
  return $bmp
}

# Only the sizes the site actually references. Add to this list if you place
# the logo somewhere new — shipping unused variants just bloats the deploy.
#   96  -> navbar (38px) and footer (56px), at 2.5x/1.7x
#   256 -> 192x192 favicon
#   32  -> 32x32 favicon
$made = @()
foreach ($s in 256, 96, 32) {
  $b = New-CircleLogo $s
  $p = Join-Path $out "logo-$s.png"
  Save-Png $b $p
  $b.Dispose()
  $made += [pscustomobject]@{ file = "logo-$s.png"; bytes = (Get-Item $p).Length }
}

# Apple touch icon: iOS renders it on its own rounded tile, so give it the
# site's midnight backdrop rather than transparency.
$apple = New-Object System.Drawing.Bitmap 180, 180, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$ag = [System.Drawing.Graphics]::FromImage($apple)
$ag.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$ag.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$ag.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$ag.Clear([System.Drawing.ColorTranslator]::FromHtml('#0a0e1a'))
$circle = New-CircleLogo 164
$ag.DrawImage($circle, 8, 8, 164, 164)
$circle.Dispose(); $ag.Dispose()
Save-Png $apple (Join-Path $out 'apple-touch-icon.png')
$apple.Dispose()
$made += [pscustomobject]@{ file = 'apple-touch-icon.png'; bytes = (Get-Item (Join-Path $out 'apple-touch-icon.png')).Length }

# ---- Open Graph card: 1200x630 on the site's midnight indigo ----
$og = New-Object System.Drawing.Bitmap 1200, 630, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($og)
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint  = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.ColorTranslator]::FromHtml('#0a0e1a'))

# Warm bloom behind the mark, echoing the site's hero
$bloom = New-Object System.Drawing.Drawing2D.GraphicsPath
$bloom.AddEllipse(190, 55, 520, 520)
$br = New-Object System.Drawing.Drawing2D.PathGradientBrush $bloom
$br.CenterColor = [System.Drawing.Color]::FromArgb(70, 201, 162, 39)
$br.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 201, 162, 39))
$g.FillPath($br, $bloom)
$br.Dispose(); $bloom.Dispose()

$mark = New-CircleLogo 380
$g.DrawImage($mark, 260, 125, 380, 380)
$mark.Dispose()

$gold  = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#e8c766'))
$ivory = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#f7f2e6'))
$muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(190, 247, 242, 230))

$fTitle = New-Object System.Drawing.Font 'Georgia', 46, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$fSub   = New-Object System.Drawing.Font 'Georgia', 26, ([System.Drawing.FontStyle]::Italic), ([System.Drawing.GraphicsUnit]::Pixel)
$fFoot  = New-Object System.Drawing.Font 'Segoe UI', 19, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)

$g.DrawString('Azhar Islamic',       $fTitle, $ivory, 690, 205)
$g.DrawString('Ruqyah Centre',       $fTitle, $gold,  690, 262)
$g.DrawString('Healing through the', $fSub,   $muted, 692, 335)
$g.DrawString('Qur''an and the Sunnah', $fSub, $muted, 692, 370)
$g.DrawString('Healing is from Allah alone.', $fFoot, $muted, 692, 425)

# Hairline gold rule under the wordmark
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(120, 201, 162, 39)), 2
$g.DrawLine($pen, 694, 320, 1010, 320)
$pen.Dispose()

$fTitle.Dispose(); $fSub.Dispose(); $fFoot.Dispose()
$gold.Dispose(); $ivory.Dispose(); $muted.Dispose(); $g.Dispose()

$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ps  = New-Object System.Drawing.Imaging.EncoderParameters 1
$ps.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 88
$ogPath = Join-Path $out 'og-image.jpg'
$og.Save($ogPath, $enc, $ps)
$og.Dispose()
$made += [pscustomobject]@{ file = 'og-image.jpg'; bytes = (Get-Item $ogPath).Length }

$source.Dispose()
$made | ForEach-Object { "{0,-22} {1,9:N0} bytes" -f $_.file, $_.bytes }
