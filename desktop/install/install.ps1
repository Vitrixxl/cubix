# Installs Qbix, the desktop app of https://cubix.vitrixxl.fr, for the current user, without administrator
# rights: the app in %LOCALAPPDATA%\Programs\Qbix, with a Start menu and a desktop shortcut. Run it again to update.
#
#   irm https://cubix.vitrixxl.fr/install.ps1 | iex
$ErrorActionPreference = 'Stop'
# Invoke-WebRequest downloads far slower while it draws its progress bar.
$ProgressPreference = 'SilentlyContinue'

$origin = if ($env:CUBIX_ORIGIN) { $env:CUBIX_ORIGIN } else { 'https://cubix.vitrixxl.fr' }
if (-not [Environment]::Is64BitOperatingSystem) {
  throw "Qbix's desktop app is built for 64-bit Windows. Use it in your browser instead: $origin/timer"
}
$dir = Join-Path $env:LOCALAPPDATA 'Programs\Qbix'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('qbix-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  Write-Host 'Downloading Qbix...'
  $zip = Join-Path $tmp 'qbix.zip'
  Invoke-WebRequest -Uri "$origin/api/desktop/cubix-windows-x64.zip" -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $tmp -Force

  # A running copy holds its files: close it before replacing them. Private data lives in %APPDATA%\Cubix.
  Get-Process -Name 'Cubix' -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Milliseconds 500
  if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
  New-Item -ItemType Directory -Path (Split-Path $dir) -Force | Out-Null
  Move-Item (Join-Path $tmp 'Cubix-win32-x64') $dir

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
