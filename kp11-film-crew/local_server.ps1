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

$utf8Encoding = New-Object System.Text.UTF8Encoding($false)

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
                $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $reqBody = $reader.ReadToEnd()
            }

            $rawJsonToSend = ""

            if ($urlPath -eq "/api/shoots" -and $method -eq "GET") {
                $shootsFile = Join-Path $PSScriptRoot "data\shoots.json"
                $usersFile = Join-Path $PSScriptRoot "data\users.json"
                $shootsRaw = if (Test-Path $shootsFile) { [System.IO.File]::ReadAllText($shootsFile, [System.Text.Encoding]::UTF8) } else { "[]" }
                $usersRaw = if (Test-Path $usersFile) { [System.IO.File]::ReadAllText($usersFile, [System.Text.Encoding]::UTF8) } else { "[]" }

                $totalCount = 0
                $completedCount = 0
                try {
                    $sList = $shootsRaw | ConvertFrom-Json
                    if ($sList) {
                        $totalCount = [int](@($sList).Count)
                        $completedCount = [int](@($sList | Where-Object { $_.isCompleted -eq $true }).Count)
                    }
                } catch {}

                $rawJsonToSend = "{`"success`":true,`"shoots`":$shootsRaw,`"students`":$usersRaw,`"stats`":{`"totalShoots`":$totalCount,`"completedShoots`":$completedCount},`"userStats`":{`"rating`":4.8,`"completedParticipated`":4,`"totalParticipated`":5}}"
            }
            elseif ($urlPath -eq "/api/shoots" -and $method -eq "POST") {
                $shootsFile = Join-Path $PSScriptRoot "data\shoots.json"
                $usersFile = Join-Path $PSScriptRoot "data\users.json"
                $shoots = if (Test-Path $shootsFile) { [System.IO.File]::ReadAllText($shootsFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json } else { @() }
                $users = if (Test-Path $usersFile) { [System.IO.File]::ReadAllText($usersFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json } else { @() }

                $parsed = if ($reqBody) { $reqBody | ConvertFrom-Json } else { @{} }
                $newId = "shoot-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

                $creatorName = "Creator"
                if ($users.Count -gt 0 -and $users[0].fullName) {
                    $creatorName = $users[0].fullName
                }

                $newCrew = @()
                if ($parsed.crewAssignments) {
                    $cIdx = 1
                    foreach ($ca in $parsed.crewAssignments) {
                        $uId = $ca.userId
                        $st = $users | Where-Object { $_.id -eq $uId } | Select-Object -First 1
                        $cRole = if ($ca.craftRole) { $ca.craftRole } else { "Crew" }
                        $memberObj = [PSCustomObject]@{
                            id = "c-$newId-$cIdx"
                            roleInShoot = $cRole
                            status = "PENDING"
                            attendance = "PRESENT"
                            userId = $uId
                            user = if ($st) {
                                [PSCustomObject]@{
                                    id = $st.id
                                    fullName = $st.fullName
                                    groupName = $st.groupName
                                    rating = $st.rating
                                    telegram = $st.telegram
                                }
                            } else {
                                $null
                            }
                        }
                        $newCrew += $memberObj
                        $cIdx++
                    }
                }

                $sTitle = if ($parsed.title) { $parsed.title } else { "New Shoot" }
                $sDesc = if ($parsed.description) { $parsed.description } else { "" }
                $sType = if ($parsed.type) { $parsed.type } else { "STUDIO" }
                $sDate = if ($parsed.date) { $parsed.date } else { [DateTime]::UtcNow.ToString("o") }
                $sLoc = if ($parsed.location) { $parsed.location } else { "KP11" }
                $sLat = if ($parsed.latitude) { [double]$parsed.latitude } else { 55.751244 }
                $sLon = if ($parsed.longitude) { [double]$parsed.longitude } else { 37.618423 }

                $newShoot = [PSCustomObject]@{
                    id = $newId
                    title = $sTitle
                    description = $sDesc
                    type = $sType
                    date = $sDate
                    location = $sLoc
                    isCompleted = $false
                    latitude = $sLat
                    longitude = $sLon
                    creator = [PSCustomObject]@{
                        fullName = $creatorName
                    }
                    crew = $newCrew
                }

                $updatedShoots = @($newShoot) + @($shoots)
                $shootsJsonOut = $updatedShoots | ConvertTo-Json -Depth 6
                [System.IO.File]::WriteAllText($shootsFile, $shootsJsonOut, $utf8Encoding)

                $newShootJson = $newShoot | ConvertTo-Json -Depth 5
                $rawJsonToSend = "{`"success`":true,`"shoot`":$newShootJson}"
            }
            elseif ($urlPath -match "^/api/(?:admin/)?shoots/([^/]+)" -and $method -eq "DELETE") {
                $targetShootId = $Matches[1]
                $shootsFile = Join-Path $PSScriptRoot "data\shoots.json"
                if (Test-Path $shootsFile) {
                    $shoots = [System.IO.File]::ReadAllText($shootsFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
                    $filteredShoots = @($shoots | Where-Object { $_.id -ne $targetShootId })
                    $shootsJsonOut = $filteredShoots | ConvertTo-Json -Depth 6
                    [System.IO.File]::WriteAllText($shootsFile, $shootsJsonOut, $utf8Encoding)
                }
                $rawJsonToSend = "{`"success`":true,`"message`":`"Shoot deleted`"}"
            }
            elseif ($urlPath -eq "/api/admin/data" -and $method -eq "GET") {
                $usersFile = Join-Path $PSScriptRoot "data\users.json"
                $settingsFile = Join-Path $PSScriptRoot "data\settings.json"
                $usersRaw = if (Test-Path $usersFile) { [System.IO.File]::ReadAllText($usersFile, [System.Text.Encoding]::UTF8) } else { "[]" }
                $settingsRaw = if (Test-Path $settingsFile) { [System.IO.File]::ReadAllText($settingsFile, [System.Text.Encoding]::UTF8) } else { "{}" }
                $rawJsonToSend = "{`"success`":true,`"users`":$usersRaw,`"roles`":[],`"settings`":$settingsRaw}"
            }
            elseif ($urlPath -match "^/api/admin/users/([^/]+)" -and $method -eq "PATCH") {
                $targetUserId = $Matches[1]
                $usersFile = Join-Path $PSScriptRoot "data\users.json"
                if (Test-Path $usersFile) {
                    $users = [System.IO.File]::ReadAllText($usersFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
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
                    $usersJsonOut = $users | ConvertTo-Json -Depth 6
                    [System.IO.File]::WriteAllText($usersFile, $usersJsonOut, $utf8Encoding)
                }
                $rawJsonToSend = "{`"success`":true,`"message`":`"User updated`"}"
            }
            elseif ($urlPath -eq "/api/admin/settings" -and $method -eq "POST") {
                $settingsFile = Join-Path $PSScriptRoot "data\settings.json"
                $parsed = if ($reqBody) { $reqBody | ConvertFrom-Json } else { @{} }
                $settingsJsonOut = $parsed | ConvertTo-Json -Depth 5
                [System.IO.File]::WriteAllText($settingsFile, $settingsJsonOut, $utf8Encoding)
                $rawJsonToSend = "{`"success`":true,`"settings`":$settingsJsonOut}"
            }
            elseif ($urlPath -eq "/api/telegram/dispatch" -and $method -eq "POST") {
                $settingsFile = Join-Path $PSScriptRoot "data\settings.json"
                $token = ""
                $defaultChat = ""
                if (Test-Path $settingsFile) {
                    $setObj = [System.IO.File]::ReadAllText($settingsFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
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

                $rawJsonToSend = "{`"success`":true,`"report`":{`"deliveredCount`":$delivered,`"botTokenConfigured`":" + [string]([bool]$token).ToLower() + ",`"shareUrl`":`"https://t.me/share/url?url=KP11_CALLSHEET`"}}"
            }
            elseif ($urlPath -eq "/api/telegram/test" -and $method -eq "POST") {
                $settingsFile = Join-Path $PSScriptRoot "data\settings.json"
                $token = ""
                if (Test-Path $settingsFile) {
                    $setObj = [System.IO.File]::ReadAllText($settingsFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
                    $token = $setObj.telegramBotToken
                }
                $parsed = if ($reqBody) { $reqBody | ConvertFrom-Json } else { @{} }
                $targetChat = if ($parsed.chatId) { $parsed.chatId } else { "" }

                if ($token -and $targetChat) {
                    try {
                        $tgUri = "https://api.telegram.org/bot$token/sendMessage"
                        $tgBody = @{ chat_id = $targetChat; text = "KP11 Film Crew Bot: Connection test successful!"; parse_mode = "HTML" } | ConvertTo-Json
                        Invoke-RestMethod -Uri $tgUri -Method Post -Body $tgBody -ContentType "application/json" | Out-Null
                        $rawJsonToSend = "{`"success`":true,`"message`":`"Test message delivered to Telegram`"}"
                    } catch {
                        $errMsg = $_.Exception.Message.Replace('"', ' ')
                        $rawJsonToSend = "{`"success`":false,`"error`":`"Telegram API Error: $errMsg`"}"
                    }
                } else {
                    $rawJsonToSend = "{`"success`":false,`"error`":`"Specify bot token and Chat ID`"}"
                }
            }
            else {
                $rawJsonToSend = "{`"success`":true}"
            }

            $response.StatusCode = 200
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($rawJsonToSend)
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
        try {
            $response.StatusCode = 500
            $response.Close()
        } catch {}
    }
}
$listener.Close()
