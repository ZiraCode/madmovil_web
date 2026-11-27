Add-Type -AssemblyName System.Drawing

$brand = [System.Drawing.Color]::FromArgb(0xFF, 0x8A, 0x4A, 0x2B)
$cream = [System.Drawing.Color]::FromArgb(0xFF, 0xFA, 0xF7, 0xF2)
$dark  = [System.Drawing.Color]::FromArgb(0xFF, 0x26, 0x22, 0x1E)
$amber = [System.Drawing.Color]::FromArgb(0xFF, 0xD9, 0xA2, 0x53)

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc(($x + $w - $d), $y, $d, $d, 270, 90)
  $p.AddArc(($x + $w - $d), ($y + $h - $d), $d, $d, 0, 90)
  $p.AddArc($x, ($y + $h - $d), $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Draw-Bus($g, [float]$ox, [float]$oy, [float]$size) {
  $s = $size / 128.0
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  # ruedas (detrás, asomando bajo el cuerpo)
  $w1 = New-RoundedPath ((41.0 * $s) + $ox) ((96.0 * $s) + $oy) (16.0 * $s) (12.0 * $s) (3.0 * $s)
  $w2 = New-RoundedPath ((71.0 * $s) + $ox) ((96.0 * $s) + $oy) (16.0 * $s) (12.0 * $s) (3.0 * $s)
  $g.FillPath((New-Object System.Drawing.SolidBrush($dark)), $w1)
  $g.FillPath((New-Object System.Drawing.SolidBrush($dark)), $w2)

  # cuerpo
  $body = New-RoundedPath ((32.0 * $s) + $ox) ((24.0 * $s) + $oy) (64.0 * $s) (76.0 * $s) (10.0 * $s)
  $g.FillPath((New-Object System.Drawing.SolidBrush($cream)), $body)

  # parabrisas
  $ws = New-RoundedPath ((40.0 * $s) + $ox) ((34.0 * $s) + $oy) (48.0 * $s) (24.0 * $s) (7.0 * $s)
  $g.FillPath((New-Object System.Drawing.SolidBrush($dark)), $ws)

  # faros
  $g.FillEllipse((New-Object System.Drawing.SolidBrush($amber)), ((47.0 - 5.0) * $s + $ox), ((80.0 - 5.0) * $s + $oy), (10.0 * $s), (10.0 * $s))
  $g.FillEllipse((New-Object System.Drawing.SolidBrush($amber)), ((81.0 - 5.0) * $s + $ox), ((80.0 - 5.0) * $s + $oy), (10.0 * $s), (10.0 * $s))
}

function New-Icon([int]$size, [float]$cornerRatio) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  if ($cornerRatio -gt 0) {
    $bg = New-RoundedPath 0 0 $size $size ($cornerRatio * $size)
    $g.FillPath((New-Object System.Drawing.SolidBrush($brand)), $bg)
  } else {
    $g.FillRectangle((New-Object System.Drawing.SolidBrush($brand)), 0, 0, $size, $size)
  }
  Draw-Bus $g 0 0 $size
  $g.Dispose()
  return $bmp
}

function Save-Png($bmp, [string]$path) {
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  [System.IO.File]::WriteAllBytes($path, $ms.ToArray())
  $ms.Dispose()
  Write-Output "PNG $path ($($bmp.Width)x$($bmp.Height))"
}

function Save-Ico([int[]]$sizes, [string]$path) {
  $streams = @()
  foreach ($s in $sizes) {
    $bmp = New-Icon $s (28.0 / 128.0)
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $streams += ,@($s, $ms.ToArray())
    $ms.Dispose()
  }
  $header = New-Object System.IO.MemoryStream
  $bw = New-Object System.IO.BinaryWriter($header)
  $bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$streams.Count)
  $offset = 6 + 16 * $streams.Count
  foreach ($entry in $streams) {
    $s = $entry[0]; $bytes = $entry[1]
    $bw.Write([byte]$(if ($s -ge 256) { 0 } else { $s }))
    $bw.Write([byte]$(if ($s -ge 256) { 0 } else { $s }))
    $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([UInt16]1); $bw.Write([UInt16]32)
    $bw.Write([UInt32]$bytes.Length); $bw.Write([UInt32]$offset)
    $offset += $bytes.Length
  }
  $bw.Flush()
  $out = New-Object System.IO.MemoryStream
  $out.Write($header.ToArray(), 0, [int]$header.Length)
  foreach ($entry in $streams) { $out.Write($entry[1], 0, $entry[1].Length) }
  [System.IO.File]::WriteAllBytes($path, $out.ToArray())
  $bw.Dispose(); $out.Dispose()
  Write-Output "ICO $path ($($sizes -join '/'))"
}

$root = 'E:\Web\madmovil_web\public'
New-Item -ItemType Directory -Force -Path "$root\icons" | Out-Null

# manifest (full-bleed para maskable) + apple-touch-icon
$bmp = New-Icon 192 0; Save-Png $bmp "$root\icons\icon-192.png"; $bmp.Dispose()
$bmp = New-Icon 512 0; Save-Png $bmp "$root\icons\icon-512.png"; $bmp.Dispose()
$bmp = New-Icon 180 0; Save-Png $bmp "$root\apple-touch-icon.png"; $bmp.Dispose()

# favicon.ico (esquinas redondeadas transparentes)
Save-Ico @((16, 32, 48)) "$root\favicon.ico"

# og-image 1200x630
$og = New-Object System.Drawing.Bitmap(1200, 630)
$g = [System.Drawing.Graphics]::FromImage($og)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$g.FillRectangle((New-Object System.Drawing.SolidBrush($brand)), 0, 0, 1200, 630)
$g.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(0x14, 0xFF, 0xFF, 0xFF))), 700, -150, 700, 700)
$g.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(0x14, 0xFF, 0xFF, 0xFF))), -100, 400, 500, 500)
Draw-Bus $g 830 150 340
$titleFont = New-Object System.Drawing.Font('Segoe UI', 84, [System.Drawing.FontStyle]::Bold)
$tagFont = New-Object System.Drawing.Font('Segoe UI', 40, [System.Drawing.FontStyle]::Regular)
$creamBrush = New-Object System.Drawing.SolidBrush($cream)
$softBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(0xCC, 0xFA, 0xF7, 0xF2))
$g.DrawString('Madrid Movilidad', $titleFont, $creamBrush, 80, 225)
$g.DrawString('Transporte público de Madrid en tiempo real', $tagFont, $softBrush, 84, 385)
$g.Dispose()
Save-Png $og "$root\og-image.png"
$og.Dispose()
