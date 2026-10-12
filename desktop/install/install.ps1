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
$package = 'cubix-windows-x64'
$folder = 'Cubix-win32-x64'
$dir = Join-Path $env:LOCALAPPDATA 'Programs\Qbix'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('qbix-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  Write-Host 'Downloading Qbix...'
  $zip = Join-Path $tmp 'qbix.zip'
  Invoke-WebRequest -Uri "$origin/api/desktop/$package.zip" -OutFile $zip -UseBasicParsing
  Invoke-WebRequest -Uri "$origin/api/desktop/$package.zip.sig" -OutFile "$zip.sig" -UseBasicParsing
  # Packages are signed with a key kept off the server (scripts/deploy.ts): one that does not match this RSA key
  # (SHA-256, PKCS#1 v1.5) is not Qbix's, whoever serves it. Windows PowerShell 5.1 reads no PEM, hence its numbers.
  $key = New-Object Security.Cryptography.RSAParameters
  $key.Modulus = [Convert]::FromBase64String('596v2w8FYeJqX3xF/facCaAzmkuN897RX9uC5xi2Oo6yS8mQ0P3ENu5cRv8JMDu89pBSzt5uXHceuv1FCULBj6jLhLu4hcx2ko2t8mKYZTZK7RIRbXnoVVDQVV6rt6wex/6q/iRyuFiPBvX152T0DdcogAV3yGr9WeZvjKq1bhmA8Df67BooI01Ip2tOt/Ea4WSqLa8iUS45V6qPPYoaP3IxqWjFpc7zvZYiPYSGKWY8JsQSRqFveDz/+HfTtk3geYZF60iTDMtaLe5TdGXE03NesIopdqB3zsIf3X4FnkkTlh5b7aKB7LusdfSGcfmSsglDYF2sopOnv27Ia/Lm+42EdIIXuwACw3uLyMri4ypEI6bIJEvmQvmZsXvnD699NlKUG34H1soQ7uR7yGhCsZHVcv5B5pQGXlnjmduYWRdkK9bjYCiawbkgSW4UjlntQo6ez+sK7ZtP+/n/MAjvckBZF3bP3+NA1Ewi3hLvfgNNJBrk/fgWjY5FybYZjoZ7')
  $key.Exponent = [Convert]::FromBase64String('AQAB')
  $rsa = New-Object Security.Cryptography.RSACryptoServiceProvider
  $rsa.ImportParameters($key)
  $stream = [IO.File]::OpenRead($zip)
  try { $hash = [Security.Cryptography.SHA256]::Create().ComputeHash($stream) } finally { $stream.Dispose() }
  if (-not $rsa.VerifyHash($hash, [Security.Cryptography.CryptoConfig]::MapNameToOID('SHA256'), [IO.File]::ReadAllBytes("$zip.sig"))) {
    throw "The download's signature does not match: Qbix was not installed."
  }
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
