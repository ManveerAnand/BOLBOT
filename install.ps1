# Downloads BOLBOT to a folder you choose and starts setup. Run it again to update; your settings are kept.
# Usage (PowerShell): irm https://raw.githubusercontent.com/ManveerAnand/BOLBOT/main/install.ps1 | iex
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$default = Join-Path $HOME 'BOLBOT'
$dir = Read-Host "Install BOLBOT where? It needs about 5 GB. Press Enter for $default"
if (-not $dir) { $dir = $default }
New-Item -ItemType Directory -Force $dir | Out-Null
$zip = Join-Path $dir 'bolbot-download.zip'
$unpacked = Join-Path $dir 'bolbot-download'

Write-Host 'Downloading BOLBOT...'
Invoke-WebRequest 'https://github.com/ManveerAnand/BOLBOT/archive/refs/heads/main.zip' -OutFile $zip -UseBasicParsing
Remove-Item $unpacked -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive $zip $unpacked -Force
Copy-Item (Join-Path $unpacked 'BOLBOT-main\*') $dir -Recurse -Force
Remove-Item $zip, $unpacked -Recurse -Force

powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir 'setup.ps1')
