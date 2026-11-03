# Turns a Windows PC into a frame. Run it once in PowerShell, then sign out or restart.
# The screen shows a pairing code.
#
#   $env:FRAME_URL = 'https://photos.example.com'
#   irm https://raw.githubusercontent.com/cschweda/openmantel/main/scripts/setup-frame-windows.ps1 | iex

$ErrorActionPreference = 'Stop'
$url = $env:FRAME_URL
if (-not $url) { throw 'Set $env:FRAME_URL to the address of your OpenMantel server.' }

$browsers = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$browser = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { throw 'Chrome or Edge is required.' }

$arguments = "--kiosk $url --noerrdialogs --disable-infobars --disable-session-crashed-bubble --no-first-run --overscroll-history-navigation=0"
if ($browser -like '*msedge.exe') { $arguments += ' --edge-kiosk-type=fullscreen' }

# The loop restarts the browser after a crash, so the screen can't stay black.
$frameDir = Join-Path $env:LocalAppData 'openmantel-frame'
New-Item -ItemType Directory -Force -Path $frameDir | Out-Null
$launcher = Join-Path $frameDir 'frame.ps1'
@"
while (`$true) {
  Start-Process -FilePath '$browser' -ArgumentList '$arguments' -Wait
  Start-Sleep -Seconds 5
}
"@ | Set-Content -Path $launcher -Encoding UTF8

$startup = [Environment]::GetFolderPath('Startup')
# Remove what an install from before the OpenMantel rename left behind.
Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $startup 'pictures frame.lnk')
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $env:LocalAppData 'pictures-frame')
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $startup 'OpenMantel frame.lnk'))
$shortcut.TargetPath = 'powershell.exe'
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
$shortcut.Save()

# A frame must never blank or sleep.
powercfg /change monitor-timeout-ac 0
powercfg /change monitor-timeout-dc 0
powercfg /change standby-timeout-ac 0
powercfg /change standby-timeout-dc 0

Write-Host "Frame set up for $url. Turn on automatic sign-in if you want, then restart."
