# Installs Qbix, the desktop app of https://cubix.vitrixxl.fr, for the current user, without administrator
# rights: the app in %LOCALAPPDATA%\Programs\Qbix, with a Start menu and a desktop shortcut. Run it again to update.
# With CUBIX_SHELL=tauri, the Tauri app instead: lighter, it draws with Windows' WebView2 rather than its own Chromium.
# Each replaces the other.
#
#   irm https://cubix.vitrixxl.fr/install.ps1 | iex
#   $env:CUBIX_SHELL='tauri'; irm https://cubix.vitrixxl.fr/install.ps1 | iex
$ErrorActionPreference = 'Stop'
# Invoke-WebRequest downloads far slower while it draws its progress bar.
$ProgressPreference = 'SilentlyContinue'

$origin = if ($env:CUBIX_ORIGIN) { $env:CUBIX_ORIGIN } else { 'https://cubix.vitrixxl.fr' }
if (-not [Environment]::Is64BitOperatingSystem) {
  throw "Qbix's desktop app is built for 64-bit Windows. Use it in your browser instead: $origin/timer"
}
$package = if ($env:CUBIX_SHELL -eq 'tauri') { 'cubix-tauri-windows-x64' } else { 'cubix-windows-x64' }
$folder = if ($env:CUBIX_SHELL -eq 'tauri') { $package } else { 'Cubix-win32-x64' }
$webview = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
if ($env:CUBIX_SHELL -eq 'tauri' -and -not (@('HKLM:\SOFTWARE\WOW6432Node', 'HKCU:\Software') | Where-Object { Test-Path "$_\Microsoft\EdgeUpdate\Clients\$webview" })) {
  throw "Qbix's Tauri app needs Microsoft Edge WebView2: install it from https://developer.microsoft.com/microsoft-edge/webview2/ and run this again, or install the Electron app, which brings its own."
}
$dir = Join-Path $env:LOCALAPPDATA 'Programs\Qbix'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('qbix-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  Write-Host 'Downloading Qbix...'
  $zip = Join-Path $tmp 'qbix.zip'
  Invoke-WebRequest -Uri "$origin/api/desktop/$package.zip" -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $tmp -Force

  # A running copy holds its files: close it before replacing them. Private data lives in %APPDATA%\Cubix.
  Get-Process -Name 'Cubix' -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Milliseconds 500
  if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
  New-Item -ItemType Directory -Path (Split-Path $dir) -Force | Out-Null
  Move-Item (Join-Path $tmp $folder) $dir

  $shell = New-Object -ComObject WScript.Shell
  foreach ($folder in @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))) {
    $link = $shell.CreateShortcut((Join-Path $folder 'Qbix.lnk'))
    $link.TargetPath = Join-Path $dir 'Cubix.exe'
    $link.WorkingDirectory = $dir
    $link.IconLocation = (Join-Path $dir 'Cubix.ico') + ',0'
    $link.Description = 'Speedcubing timer and algorithm trainer'
    $link.Save()
  }
  Write-Host 'Qbix is installed: open it from the Start menu or the desktop.'
  Start-Process (Join-Path $dir 'Cubix.exe')
}
finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
