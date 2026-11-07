# Starts BOLBOT on Windows: the portable Ollama if setup installed one, then the bot. Setup runs this at sign-in.
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location -LiteralPath $root
$runtime = Join-Path $root 'runtime'
if (Test-Path (Join-Path $runtime 'node')) { $env:Path = "$(Join-Path $runtime 'node');$env:Path" }
if (Test-Path (Join-Path $runtime 'ollama\ollama.exe')) {
  $env:OLLAMA_MODELS = Join-Path $runtime 'models'
  try { Invoke-WebRequest 'http://127.0.0.1:11434' -UseBasicParsing -TimeoutSec 3 | Out-Null }
  catch {
    # Ollama keeps its keys in the home folder; keep them inside BOLBOT.
    $realProfile = $env:USERPROFILE
    $env:USERPROFILE = Join-Path $runtime 'home'
    Start-Process (Join-Path $runtime 'ollama\ollama.exe') -ArgumentList 'serve' -WindowStyle Hidden
    $env:USERPROFILE = $realProfile
  }
}
New-Item -ItemType Directory -Force logs | Out-Null
node node_modules/tsx/dist/cli.mjs src/index.ts *>&1 | Out-File -Append -Encoding utf8 logs\bot.log
exit $LASTEXITCODE
