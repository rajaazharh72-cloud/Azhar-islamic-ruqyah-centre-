# Generates the Dua Book chapters + TOC from book-data.json and injects them
# into dua-book.html's {{TOC}} / {{CHAPTERS}} placeholders.
#
# ASCII-only by design: every Arabic/Urdu string flows from the UTF-8 JSON
# through .NET strings into a .NET UTF-8 write. No non-ASCII literal sits in
# this script, so PowerShell 5.1's ANSI reading of .ps1 files cannot corrupt
# the sacred text.
$ErrorActionPreference = 'Stop'
$U8 = New-Object System.Text.UTF8Encoding($false)
$scratch = $PSScriptRoot
$proj = Split-Path -Parent $PSScriptRoot

$data = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'book-data.json'), $U8) | ConvertFrom-Json
$ui = $data.meta.ui

function Esc([string]$s) {
  if ($null -eq $s) { return '' }
  $s.Replace('&','&amp;').Replace('<','&lt;').Replace('>','&gt;')
}
# Bilingual inline pair: EN span + UR span (Urdu carries lang/dir)
function Pair([string]$en, [string]$ur) {
  "<span data-en>$(Esc $en)</span><span data-ur lang=""ur"" dir=""rtl"">$(Esc $ur)</span>"
}

$toc = New-Object System.Text.StringBuilder
$chapters = New-Object System.Text.StringBuilder
$n = 0
$chs = $data.chapters
foreach ($ch in $chs) {
  $n++
  $num2 = '{0:D2}' -f $n

  [void]$toc.Append("<li><a href=""#$($ch.id)"">$(Pair $ch.title_en $ch.title_ur)</a></li>")

  [void]$chapters.AppendLine("<section class=""chapter"" id=""$($ch.id)"" aria-labelledby=""$($ch.id)-h"">")
  [void]$chapters.AppendLine("  <header class=""chapter__head"">")
  [void]$chapters.AppendLine("    <span class=""chapter__num"">$(Pair ($ui.chapter_en + ' ' + $num2) ($ui.chapter_ur + ' ' + $num2))</span>")
  [void]$chapters.AppendLine("    <h2 class=""chapter__title"" id=""$($ch.id)-h"">$(Pair $ch.title_en $ch.title_ur)</h2>")
  [void]$chapters.AppendLine("    <p class=""chapter__intro"">$(Pair $ch.intro_en $ch.intro_ur)</p>")
  [void]$chapters.AppendLine("  </header>")

  foreach ($d in $ch.duas) {
    [void]$chapters.AppendLine("  <article class=""dua"" id=""$($d.id)"">")
    [void]$chapters.AppendLine("    <div class=""dua__label""><span class=""dua__name"">$(Pair $d.name_en $d.name_ur)</span></div>")
    [void]$chapters.AppendLine("    <p class=""dua__ar"" lang=""ar"" dir=""rtl"">$(Esc $d.ar)</p>")
    if ($d.tr) { [void]$chapters.AppendLine("    <p class=""dua__tr"">$(Esc $d.tr)</p>") }
    [void]$chapters.AppendLine("    <div class=""dua__rule"" aria-hidden=""true""></div>")
    [void]$chapters.AppendLine("    <div class=""dua__body"">")
    [void]$chapters.AppendLine("      <p class=""dua__trans"" data-en lang=""en"">$(Esc $d.en)</p>")
    [void]$chapters.AppendLine("      <p class=""dua__trans dua__trans--ur"" data-ur lang=""ur"" dir=""rtl"">$(Esc $d.ur)</p>")
    [void]$chapters.AppendLine("    </div>")
    [void]$chapters.AppendLine("    <dl class=""dua__meta"">")
    [void]$chapters.AppendLine("      <div><dt>$(Pair $ui.when_en $ui.when_ur)</dt><dd>$(Pair $d.when_en $d.when_ur)</dd></div>")
    if ($d.reps_en) {
      [void]$chapters.AppendLine("      <div><dt>$(Pair $ui.reps_en $ui.reps_ur)</dt><dd>$(Pair $d.reps_en $d.reps_ur)</dd></div>")
    }
    [void]$chapters.AppendLine("      <div><dt>$(Pair $ui.benefit_en $ui.benefit_ur)</dt><dd>$(Pair $d.benefit_en $d.benefit_ur)</dd></div>")
    [void]$chapters.AppendLine("    </dl>")
    [void]$chapters.AppendLine("    <p class=""dua__src"">$(Pair $ui.source_en $ui.source_ur)<span aria-hidden=""true"">: </span>$(Esc $d.src)</p>")
    [void]$chapters.AppendLine("  </article>")
  }

  [void]$chapters.AppendLine("  <nav class=""chapter__nav"" aria-label=""Chapter navigation"">")
  if ($n -gt 1) {
    $prev = $chs[$n-2]
    [void]$chapters.AppendLine("    <a href=""#$($prev.id)""><svg viewBox=""0 0 24 24"" aria-hidden=""true"" style=""rotate:180deg""><use href=""#i-chevron""/></svg>$(Pair $ui.prev_en $ui.prev_ur)</a>")
  } else {
    [void]$chapters.AppendLine("    <a href=""#book-contents"" hidden></a>")
  }
  if ($n -lt $chs.Count) {
    $next = $chs[$n]
    [void]$chapters.AppendLine("    <a href=""#$($next.id)"">$(Pair $ui.next_en $ui.next_ur)<svg viewBox=""0 0 24 24"" aria-hidden=""true""><use href=""#i-chevron""/></svg></a>")
  } else {
    [void]$chapters.AppendLine("    <a href=""#book-intro"" hidden></a>")
  }
  [void]$chapters.AppendLine("  </nav>")
  [void]$chapters.AppendLine("</section>")
}

$htmlPath = Join-Path $proj 'dua-book.html'
# Always generate from the pristine template so re-runs are reproducible.
$html = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'dua-book.template.html'), $U8)
$html = $html.Replace('{{TOC}}', $toc.ToString())
$html = $html.Replace('{{CHAPTERS}}', $chapters.ToString())
[System.IO.File]::WriteAllText($htmlPath, $html, $U8)

"chapters: $($chs.Count)"
"duas    : $(($chs | ForEach-Object { $_.duas.Count } | Measure-Object -Sum).Sum)"
"placeholders left: TOC=$([regex]::Matches($html,'\{\{TOC\}\}').Count) CHAPTERS=$([regex]::Matches($html,'\{\{CHAPTERS\}\}').Count)"
"dua-book.html: $([Math]::Round((Get-Item $htmlPath).Length/1KB,1)) KB"
