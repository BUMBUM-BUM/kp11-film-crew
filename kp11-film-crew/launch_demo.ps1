# Запуск изолированного демонстрационного стенда КП11 на порту 3001
$ErrorActionPreference = "Stop"
$demoPort = 3001

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   МЕДИАЦЕНТР КП11 // ДЕМОНСТРАЦИОННЫЙ СТЕНД              " -ForegroundColor Red
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "База данных: изолированная папка .\demo_data\" -ForegroundColor Yellow
Write-Host "Рабочий сайт (порт 3000): НЕ затрагивается" -ForegroundColor Green
Write-Host "Демо-сервер: http://localhost:$demoPort/" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan

# Поиск node.exe
$nodePaths = @(
    "C:\Users\bad14\AppData\Local\Programs\com.brotorrent.torrent-client-utorrent\resources\app.asar.unpacked\node_modules\node\bin\node.exe",
    "node.exe"
)

$nodeExe = $null
foreach ($path in $nodePaths) {
    if (Test-Path $path) {
        $nodeExe = $path
        break
    }
}

if (-not $nodeExe) {
    $nodeExe = "node"
}

& $nodeExe demo_server.js
