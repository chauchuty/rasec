Add-Type -AssemblyName System.Drawing

function New-Icon([int]$size, [string]$out, [bool]$maskable) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  # Fundo carvão (do banner)
  $g.Clear([System.Drawing.Color]::FromArgb(255, 13, 11, 9))

  # Círculo de brasa vermelho
  $escovaVerm = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 224, 36, 24))
  $raioBrasa = [float](0.40 * $size)
  $g.FillEllipse($escovaVerm, (2*[float]($size/2 - $raioBrasa)) / 2, (2*[float]($size/2 - $raioBrasa)) / 2, [float](2*$raioBrasa), [float](2*$raioBrasa))

  # Palito do espeto (diagonal creme)
  $escovaCreme = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 242, 232, 207))
  $penPalito = New-Object System.Drawing.Pen -ArgumentList @(
    [System.Drawing.Color]::FromArgb(255, 242, 232, 207),
    [float](14 * $size / 512)
  )
  $cx = [float]($size / 2); $cy = [float]($size / 2)
  $half = [float](0.30 * $size)
  $g.DrawLine($penPalito, [float]($cx - $half*0.8), [float]($cy + $half*0.9), [float]($cx + $half*0.9), [float]($cy - $half*0.7))

  # Pedidos de carne no espeto
  for ($i = -1; $i -le 1; $i++) {
    $dx = [float]($i * 0.17 * $size)
    $dy = [float]($i * 0.13 * $size)
    $r = [float](0.105 * $size)
    $g.FillEllipse($escovaCreme, [float]($cx + $dx - $r), [float]($cy + $dy - $r), [float](2*$r), [float](2*$r))
  }

  # Letra R tinta (pesada, com deslocamento de contorno)
  $fonte = New-Object System.Drawing.Font -ArgumentList @(
    [string]'Arial Black',
    [float](0.30 * $size),
    [System.Drawing.FontStyle]::Bold,
    [System.Drawing.GraphicsUnit]::Pixel
  )
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $ret = New-Object System.Drawing.RectangleF ([float]0), ([float]0), ([float]$size), ([float]$size)
  $escovaTinta = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 23, 19, 16))
  $desloc = [float](4 * $size / 512)
  $ret2 = New-Object System.Drawing.RectangleF ([float](-$desloc)), ([float]$desloc), ([float]$size), ([float]$size)
  $g.DrawString('R', $fonte, $escovaTinta, $ret2, $fmt)
  $g.DrawString('R', $fonte, $escovaCreme, $ret, $fmt)

  $g.Dispose()
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "criado: $out"
}

$dir = Join-Path $PWD 'icons'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

New-Icon 192 (Join-Path $dir 'icon-192.png') $false
New-Icon 512 (Join-Path $dir 'icon-512.png') $false
New-Icon 192 (Join-Path $dir 'icon-maskable-192.png') $true
New-Icon 512 (Join-Path $dir 'icon-maskable-512.png') $true
