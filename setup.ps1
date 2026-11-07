# BOLBOT setup for Windows 10 and 11. Safe to run again: finished steps are skipped.
# Run: powershell -ExecutionPolicy Bypass -File setup.ps1
# Installs nothing outside this folder and needs no admin rights.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Model = 'translategemma:4b'
$Ollama = 'http://127.0.0.1:11434'
$Api = 'https://discord.com/api/v10'
# Manage Roles, Manage Channels, Manage Webhooks, View Channels, Send Messages, Read Message History
$Permissions = 805374992
$TaskName = 'BOLBOT'
# Node.js, Ollama and the model all live in here, so BOLBOT stays on the drive you installed it to.
$Runtime = Join-Path $PSScriptRoot 'runtime'
$PortableNode = Join-Path $Runtime 'node'
$PortableOllama = Join-Path $Runtime 'ollama'
$env:npm_config_cache = Join-Path $Runtime 'npm-cache'

function Step($text) { Write-Host "`n$text" -ForegroundColor White }
function Ok($text) { Write-Host "  [ok] $text" -ForegroundColor Green }
function Fail($text) { Write-Host "`n  $text`n" -ForegroundColor Red; exit 1 }

function Get-EnvValue($key) {
  if (-not (Test-Path .env)) { return '' }
  $line = Get-Content .env | Where-Object { $_ -like "$key=*" } | Select-Object -First 1
  if ($line) { return $line.Substring($key.Length + 1) } else { return '' }
}
function Set-EnvValue($key, $value) {
  $found = $false
  $out = @(foreach ($line in Get-Content .env) {
      if ($line -like "$key=*") { if (-not $found) { "$key=$value"; $found = $true } } else { $line }
    })
  if (-not $found) { $out += "$key=$value" }
  [IO.File]::WriteAllLines((Join-Path $PWD '.env'), [string[]]$out)
}
function Invoke-Discord($path) {
  # Discord refuses PowerShell's default user agent.
  Invoke-RestMethod -Uri "$Api$path" -UserAgent 'DiscordBot (https://github.com/ManveerAnand/BOLBOT, 1.0)' -Headers @{ Authorization = "Bot $(Get-EnvValue 'DISCORD_BOT_TOKEN')" }
}
function Test-Node {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $false }
  return [int]((node -v).TrimStart('v').Split('.')[0]) -ge 22
}
function Test-Ollama {
  try { Invoke-WebRequest $Ollama -UseBasicParsing -TimeoutSec 3 | Out-Null; return $true } catch { return $false }
}
# Downloads a zip and unpacks it to runtime\<name>.
function Get-Portable($url, $name, $label) {
  Write-Host "  Downloading $label..."
  New-Item -ItemType Directory -Force $Runtime | Out-Null
  $zip = Join-Path $Runtime "$name.zip"
  $unpacked = Join-Path $Runtime "$name-unpacked"
  $ProgressPreference = 'SilentlyContinue'
  Invoke-WebRequest $url -OutFile $zip -UseBasicParsing
  Remove-Item $unpacked, (Join-Path $Runtime $name) -Recurse -Force -ErrorAction SilentlyContinue
  Expand-Archive $zip $unpacked -Force
  $inner = @(Get-ChildItem $unpacked)
  # Node's zip has one top folder; Ollama's doesn't.
  $source = if ($inner.Count -eq 1 -and $inner[0].PSIsContainer) { $inner[0].FullName } else { $unpacked }
  Move-Item $source (Join-Path $Runtime $name)
  Remove-Item $zip, $unpacked -Recurse -Force -ErrorAction SilentlyContinue
}

Step '1/6  Checking your PC'
if ([Environment]::OSVersion.Version.Major -lt 10) { Fail 'BOLBOT needs Windows 10 or 11.' }
Ok "Windows, installing to $PSScriptRoot"

Step '2/6  Node.js'
if (Test-Path $PortableNode) { $env:Path = "$PortableNode;$env:Path" }
if (-not (Test-Node)) {
  $version = ((Invoke-RestMethod 'https://nodejs.org/dist/index.json') | Where-Object { $_.version -like 'v24.*' } | Select-Object -First 1).version
  Get-Portable "https://nodejs.org/dist/$version/node-$version-win-x64.zip" 'node' 'Node.js'
  $env:Path = "$PortableNode;$env:Path"
}
if (-not (Test-Node)) { Fail 'Node.js 22 or newer is needed. Install it from https://nodejs.org, then run setup again.' }
Ok "Node.js $(node -v)"
Write-Host "  Installing BOLBOT's parts..."
npm ci --no-audit --no-fund --loglevel=error | Out-Null
if ($LASTEXITCODE -ne 0) { Fail 'Installing failed. Check your internet connection and run setup again.' }
Ok 'Ready'

Step '3/6  Translation model'
# Someone who already has Ollama keeps using theirs. Everyone else gets a portable copy inside BOLBOT.
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  if (-not (Test-Path (Join-Path $PortableOllama 'ollama.exe'))) {
    Get-Portable 'https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip' 'ollama' 'Ollama (about 1.6 GB, once)'
  }
  $env:Path = "$PortableOllama;$env:Path"
  $env:OLLAMA_MODELS = Join-Path $Runtime 'models'
  # Ollama keeps its keys in the home folder; point it inside BOLBOT so nothing lands on another drive.
  $realProfile = $env:USERPROFILE
  $env:USERPROFILE = Join-Path $Runtime 'home'
  New-Item -ItemType Directory -Force $env:USERPROFILE | Out-Null
}
if (-not (Test-Ollama)) {
  Start-Process ollama -ArgumentList 'serve' -WindowStyle Hidden
  for ($i = 0; $i -lt 30 -and -not (Test-Ollama); $i++) { Start-Sleep 1 }
}
if (-not (Test-Ollama)) { Fail 'Ollama would not start. Restart your PC and run setup again.' }
Ok 'Ollama running'
if (-not ((ollama list) -match [regex]::Escape($Model))) {
  Write-Host '  Downloading the translation model (about 3 GB, once)...'
  ollama pull $Model
  if ($LASTEXITCODE -ne 0) { Fail 'The model download failed. Check your internet connection and run setup again.' }
}
if ($realProfile) { $env:USERPROFILE = $realProfile }
Ok 'Model downloaded'

Step '4/6  Your Discord bot'
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
Set-EnvValue 'TRANSLATION_RUNNER' 'ollama'
Set-EnvValue 'TRANSLATION_BASE_URL' $Ollama
Set-EnvValue 'TRANSLATION_MODEL' $Model
# Loading the model the first time after a restart can take over 30 seconds on a PC.
Set-EnvValue 'TRANSLATION_TIMEOUT_MS' '120000'
if (-not (Get-EnvValue 'DISCORD_BOT_TOKEN')) {
  Write-Host @'
  BOLBOT runs as your own Discord bot. Making one takes a minute:
    1. Open https://discord.com/developers/applications and click New Application.
    2. Name it (for example BOLBOT), then open the Bot page.
    3. Turn on Message Content Intent and click Save.
    4. Click Reset Token and copy the token.
'@
  $secure = Read-Host '  Paste the bot token (it stays hidden)' -AsSecureString
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  if (-not $token) { Fail 'No token entered. Run setup again when you have it.' }
  Set-EnvValue 'DISCORD_BOT_TOKEN' $token.Trim()
  Remove-Variable token
}
try { $app = Invoke-Discord '/applications/@me' } catch {
  if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) {
    Set-EnvValue 'DISCORD_BOT_TOKEN' ''
    Fail "Discord didn't accept that token. Copy it again from the Bot page and run setup again."
  }
  Fail "Couldn't reach Discord ($($_.Exception.Message)). Check your internet connection and run setup again."
}
# 1 << 18 and 1 << 19 are Discord's flags for the Message Content intent.
while (($app.flags -band ((1 -shl 18) -bor (1 -shl 19))) -eq 0) {
  Read-Host '  Turn on Message Content Intent on the Bot page, click Save, then press Enter' | Out-Null
  $app = Invoke-Discord '/applications/@me'
}
Set-EnvValue 'DISCORD_CLIENT_ID' $app.id
Ok "Bot `"$($app.name)`" connected"

Step '5/6  Add the bot to your server'
if (-not (Get-EnvValue 'DISCORD_GUILD_ID')) {
  $invite = "https://discord.com/oauth2/authorize?client_id=$($app.id)&scope=bot%20applications.commands&permissions=$Permissions"
  Write-Host '  Opening the invite page. Pick your server and click Authorize.'
  Write-Host "  If it doesn't open: $invite"
  Start-Process $invite
  while ($true) {
    Read-Host '  Press Enter once the bot is in your server' | Out-Null
    $guilds = @(Invoke-Discord '/users/@me/guilds')
    if ($guilds.Count -gt 0) { break }
    Write-Host "  The bot isn't in a server yet."
  }
  $pick = 0
  if ($guilds.Count -gt 1) {
    for ($i = 0; $i -lt $guilds.Count; $i++) { Write-Host "    $($i + 1). $($guilds[$i].name)" }
    $pick = [int](Read-Host '  Which server should BOLBOT translate? Number') - 1
  }
  Set-EnvValue 'DISCORD_GUILD_ID' $guilds[$pick].id
}
Ok 'Server chosen'
npm run -s db:migrate | Out-Null
if ($LASTEXITCODE -ne 0) { Fail 'Setting up the database failed. Run setup again.' }
Ok 'Database ready'

Step '6/6  Start BOLBOT'
$runner = Join-Path $PWD 'run.ps1'
$answer = Read-Host '  Start BOLBOT now and every time you sign in to Windows? [Y/n]'
if ($answer -match '^[Nn]') {
  Write-Host "  To start it yourself: powershell -ExecutionPolicy Bypass -File `"$runner`""
  exit 0
}
New-Item -ItemType Directory -Force logs | Out-Null
$log = Join-Path $PWD 'logs\bot.log'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
$seen = if (Test-Path $log) { (Get-Content $log).Count } else { 0 }
Start-ScheduledTask -TaskName $TaskName
Write-Host '  Waiting for BOLBOT to come online...'
$online = $false
for ($i = 0; $i -lt 60 -and -not $online; $i++) {
  Start-Sleep 2
  if (Test-Path $log) { $online = [bool](Get-Content $log | Select-Object -Skip $seen | Select-String 'discord_ready') }
}
if (-not $online) { Fail "BOLBOT didn't come online. Check logs\bot.log for the reason." }
Ok 'BOLBOT is online'

Write-Host @'

  You're set. In your Discord server:
    1. /translator room-create  to make a room, for example "general"
    2. /translator language-enable  for each language your friends speak
    3. /translator welcome  in a channel everyone sees, so people can pick their language

'@
