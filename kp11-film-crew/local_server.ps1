# ==============================================================================
# KP11 Production Server Launcher
# ==============================================================================

$port = 3000

$nodeCandidates = @(
    "node",
    "C:\Users\bad14\AppData\Local\Programs\com.brotorrent.torrent-client-utorrent\resources\app.asar.unpacked\node_modules\node\bin\node.exe",
    "C:\Program Files\nodejs\node.exe"
)

$foundNode = $null
foreach ($cand in $nodeCandidates) {
    try {
        if ($cand -eq "node") {
            $cmd = Get-Command node -ErrorAction SilentlyContinue
            if ($cmd) { $foundNode = "node"; break }
        } elseif (Test-Path $cand) {
            $foundNode = $cand
            break
        }
    } catch {}
}

if ($foundNode) {
    Write-Host ">>> Starting KP11 Autonomous Watchdog & Server on port $port..."
    $watchdogScript = Join-Path $PSScriptRoot "scripts\site_watchdog.js"
    & $foundNode $watchdogScript
    exit $LASTEXITCODE
} else {
    Write-Error "Node.js executable was not found."
    exit 1
}
