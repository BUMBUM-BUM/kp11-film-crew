# ==============================================================================
# Local preview HTTP server for KP11 Film Crew
# ==============================================================================

$port = 3000
$baseDir = Join-Path $PSScriptRoot "public"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
    Write-Host ">>> KP11 Local Server started: http://localhost:$port/"
} catch {
    Write-Error "Failed to start listener on port $port : $_"
    exit 1
}

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".json" = "application/json; charset=utf-8"
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = $request.Url.LocalPath

        # Handle API calls
        if ($urlPath.StartsWith("/api/")) {
            $response.ContentType = "application/json; charset=utf-8"
            $method = $request.HttpMethod

            $reqBody = ""
            if ($request.HasEntityBody) {
                $reader = New-Object System.IO.StreamReader($request.InputStream, $request.ContentEncoding)
                $reqBody = $reader.ReadToEnd()
                $reader.Close()
            }

            $resultObj = @{ success = $true }

            if ($urlPath -eq "/api/shoots" -and $method -eq "GET") {
                $shootsFile = Join-Path $PSScriptRoot "data\shoots.json"
                $usersFile = Join-Path $PSScriptRoot "data\users.json"
                $shoots = if (Test-Path $shootsFile) { Get-Content $shootsFile -Raw -Encoding UTF8 | ConvertFrom-Json } else { @() }
                $users = if (Test-Path $usersFile) { Get-Content $usersFile -Raw -Encoding UTF8 | ConvertFrom-Json } else { @() }
                $resultObj = @{
                    shoots = $shoots
                    students = $users
                    stats = @{ totalShoots = $shoots.Count; completedShoots = 1 }
                    userStats = @{ rating = 4.8; completedParticipated = 4; totalParticipated = 5 }
                }
            }
            elseif ($urlPath -eq "/api/admin/data" -and $method -eq "GET") {
                $usersFile = Join-Path $PSScriptRoot "data\users.json"
                $settingsFile = Join-Path $PSScriptRoot "data\settings.json"
                $users = if (Test-Path $usersFile) { Get-Content $usersFile -Raw -Encoding UTF8 | ConvertFrom-Json } else { @() }
                $settings = if (Test-Path $settingsFile) { Get-Content $settingsFile -Raw -Encoding UTF8 | ConvertFrom-Json } else { @{} }
                $resultObj = @{
                    users = $users
                    roles = @()
                    settings = $settings
                }
            }
            elseif ($urlPath -match "^/api/admin/users/([^/]+)" -and $method -eq "PATCH") {
                $targetUserId = $Matches[1]
                $usersFile = Join-Path $PSScriptRoot "data\users.json"
                if (Test-Path $usersFile) {
                    $users = Get-Content $usersFile -Raw -Encoding UTF8 | ConvertFrom-Json
                    $parsed = if ($reqBody) { $reqBody | ConvertFrom-Json } else { @{} }
                    foreach ($u in $users) {
                        if ($u.id -eq $targetUserId) {
                            if ($parsed.fullName) { $u.fullName = $parsed.fullName }
                            if ($parsed.groupName) { $u.groupName = $parsed.groupName }
                            if ($parsed.rating) { $u.rating = [double]$parsed.rating }
                            if ($parsed.telegram -ne $null) { $u.telegram = $parsed.telegram }
                            break
                        }
                    }
                    $users | ConvertTo-Json -Depth 5 | Set-Content $usersFile -Encoding UTF8
                }
                $resultObj = @{ success = $true; message = "User updated" }
            }
            elseif ($urlPath -eq "/api/admin/settings" -and $method -eq "POST") {
                $settingsFile = Join-Path $PSScriptRoot "data\settings.json"
                $parsed = if ($reqBody) { $reqBody | ConvertFrom-Json } else { @{} }
                $parsed | ConvertTo-Json -Depth 5 | Set-Content $settingsFile -Encoding UTF8
                $resultObj = @{ success = $true; settings = $parsed }
            }
            elseif ($urlPath -eq "/api/telegram/dispatch" -and $method -eq "POST") {
                $settingsFile = Join-Path $PSScriptRoot "data\settings.json"
                $token = ""
                $defaultChat = ""
                if (Test-Path $settingsFile) {
                    $setObj = Get-Content $settingsFile -Raw -Encoding UTF8 | ConvertFrom-Json
                    $token = $setObj.telegramBotToken
                    $defaultChat = $setObj.defaultChatId
                }

                $delivered = 0
                if ($token -and $defaultChat) {
                    try {
                        $parsed = if ($reqBody) { $reqBody | ConvertFrom-Json } else { @{} }
                        $sTitle = if ($parsed.shoot.title) { $parsed.shoot.title } else { "Shoot" }
                        $sLoc = if ($parsed.shoot.location) { $parsed.shoot.location } else { "KP11 Pavilion" }
                        $msgText = "<b>KP11 FILM CREW // CALL SHEET</b>`nProject: $sTitle`nLocation: $sLoc"
                        $tgUri = "https://api.telegram.org/bot$token/sendMessage"
                        $tgBody = @{ chat_id = $defaultChat; text = $msgText; parse_mode = "HTML" } | ConvertTo-Json
                        Invoke-RestMethod -Uri $tgUri -Method Post -Body $tgBody -ContentType "application/json" | Out-Null
                        $delivered = 1
                    } catch {}
                }

                $resultObj = @{
                    success = $true
                    report = @{
                        deliveredCount = $delivered
                        botTokenConfigured = [bool]$token
                        shareUrl = "https://t.me/share/url?url=KP11_CALLSHEET"
                    }
                }
            }
            elseif ($urlPath -eq "/api/telegram/test" -and $method -eq "POST") {
                $settingsFile = Join-Path $PSScriptRoot "data\settings.json"
                $token = ""
                if (Test-Path $settingsFile) {
                    $setObj = Get-Content $settingsFile -Raw -Encoding UTF8 | ConvertFrom-Json
                    $token = $setObj.telegramBotToken
                }
                $parsed = if ($reqBody) { $reqBody | ConvertFrom-Json } else { @{} }
                $targetChat = if ($parsed.chatId) { $parsed.chatId } else { "" }

                if ($token -and $targetChat) {
                    try {
                        $tgUri = "https://api.telegram.org/bot$token/sendMessage"
                        $tgBody = @{ chat_id = $targetChat; text = "KP11 Film Crew Bot: Connection test successful!"; parse_mode = "HTML" } | ConvertTo-Json
                        Invoke-RestMethod -Uri $tgUri -Method Post -Body $tgBody -ContentType "application/json" | Out-Null
                        $resultObj = @{ success = $true; message = "Test message delivered to Telegram" }
                    } catch {
                        $resultObj = @{ success = $false; error = "Telegram API Error: $($_.Exception.Message)" }
                    }
                } else {
                    $resultObj = @{ success = $false; error = "Specify bot token and Chat ID" }
                }
            }

            $response.StatusCode = 200
            $jsonRes = $resultObj | ConvertTo-Json -Depth 5
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonRes)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.Close()
            continue
        }

        if ($urlPath -eq "/" -or [string]::IsNullOrWhiteSpace($urlPath)) {
            $urlPath = "/index.html"
        }

        $relPath = $urlPath.TrimStart("/").Replace("/", "\")
        $filePath = Join-Path $baseDir $relPath

        if (Test-Path -Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
            $response.ContentType = $mime
            
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }

        $response.Close()
    } catch {
        Write-Host "Request error: $_"
    }
}
$listener.Close()
