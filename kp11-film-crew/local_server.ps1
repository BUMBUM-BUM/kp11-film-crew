# ==============================================================================
# Local preview HTTP server for KP11 Film Crew
# ==============================================================================

$port = 3000
$baseDir = Join-Path $PSScriptRoot "public"

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

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
                $helperScript = Join-Path $PSScriptRoot "data\shoots_helper.js"
                $nodeExe = "C:\Users\bad14\AppData\Local\Programs\com.brotorrent.torrent-client-utorrent\resources\app.asar.unpacked\node_modules\node\bin\node.exe"
                $tempFile = Join-Path $PSScriptRoot "data\temp_shoot_$([Guid]::NewGuid().ToString('N')).json"
                try {
                    [System.IO.File]::WriteAllText($tempFile, $reqBody, $utf8Encoding)
                    if (Test-Path $nodeExe) {
                        $rawJsonToSend = & $nodeExe $helperScript add $tempFile
                    } else {
                        $rawJsonToSend = "{`"success`":true}"
                    }
                } finally {
                    if (Test-Path $tempFile) { Remove-Item $tempFile -Force -ErrorAction SilentlyContinue }
                }
            }
            elseif ($urlPath -match "^/api/(?:admin/)?shoots/([^/]+)" -and $method -eq "DELETE") {
                $targetShootId = $Matches[1]
                $helperScript = Join-Path $PSScriptRoot "data\shoots_helper.js"
                $nodeExe = "C:\Users\bad14\AppData\Local\Programs\com.brotorrent.torrent-client-utorrent\resources\app.asar.unpacked\node_modules\node\bin\node.exe"
                if (Test-Path $nodeExe) {
                    & $nodeExe $helperScript delete $targetShootId | Out-Null
                } else {
                    $shootsFile = Join-Path $PSScriptRoot "data\shoots.json"
                    if (Test-Path $shootsFile) {
                        $shoots = [System.IO.File]::ReadAllText($shootsFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
                        $filteredShoots = @($shoots | Where-Object { $_.id -ne $targetShootId })
                        if ($filteredShoots.Count -eq 0) {
                            [System.IO.File]::WriteAllText($shootsFile, "[]", $utf8Encoding)
                        }
                    }
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
            elseif ($urlPath -eq "/api/auth/login" -and $method -eq "POST") {
                $usersFile = Join-Path $PSScriptRoot "data\users.json"
                $parsed = if ($reqBody) { $reqBody | ConvertFrom-Json } else { @{} }
                $email = if ($parsed.email) { $parsed.email.ToString().Trim().ToLower() } else { "" }
                
                $foundUser = $null
                if (Test-Path $usersFile) {
                    $users = [System.IO.File]::ReadAllText($usersFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
                    foreach ($u in $users) {
                        if ($u.email -and $u.email.ToString().Trim().ToLower() -eq $email) {
                            $foundUser = $u
                            break
                        }
                    }
                }
                
                if ($foundUser) {
                    $roleStr = if ($foundUser.role -and $foundUser.role.name) { $foundUser.role.name } elseif ($foundUser.role) { [string]$foundUser.role } else { "Студент" }
                    $token = "token-$($foundUser.id)"
                    $ratingVal = if ($foundUser.rating -ne $null) { [double]$foundUser.rating } else { 4.8 }
                    $userObj = @{
                        id = $foundUser.id
                        fullName = $foundUser.fullName
                        email = $foundUser.email
                        groupName = $foundUser.groupName
                        role = $roleStr
                        telegram = $foundUser.telegram
                        craftRank = $foundUser.craftRank
                        rating = $ratingVal
                    }
                    $userJson = $userObj | ConvertTo-Json -Depth 3
                    $rawJsonToSend = "{`"success`":true,`"token`":`"$token`",`"user`":$userJson}"
                } else {
                    $response.StatusCode = 400
                    $rawJsonToSend = "{`"success`":false,`"error`":`"Неверный email или пароль`"}"
                }
            }
            elseif ($urlPath -eq "/api/auth/register" -and $method -eq "POST") {
                $usersFile = Join-Path $PSScriptRoot "data\users.json"
                $parsed = if ($reqBody) { $reqBody | ConvertFrom-Json } else { @{} }
                $email = if ($parsed.email) { $parsed.email.ToString().Trim().ToLower() } else { "" }
                $fullName = if ($parsed.fullName) { $parsed.fullName.ToString().Trim() } else { "Студент" }
                $groupName = if ($parsed.groupName) { $parsed.groupName.ToString().Trim() } else { "КТ-26" }
                
                $users = @()
                if (Test-Path $usersFile) {
                    $users = @([System.IO.File]::ReadAllText($usersFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json)
                }
                
                $newId = "u-$([Guid]::NewGuid().ToString('N').Substring(0,6))"
                $newUser = @{
                    id = $newId
                    fullName = $fullName
                    email = $email
                    groupName = $groupName
                    rating = 5.0
                    telegram = ""
                    telegramChatId = $null
                    craftRank = "Ассистент цеха"
                    isSuspended = $false
                    role = @{ name = "Студент" }
                    competencies = @{ camera = 85; sound = 80; light = 80; edit = 85 }
                    skills = @("Оператор")
                }
                $users += $newUser
                $usersJsonOut = $users | ConvertTo-Json -Depth 5
                [System.IO.File]::WriteAllText($usersFile, $usersJsonOut, $utf8Encoding)
                
                $token = "token-$newId"
                $userObj = @{
                    id = $newId
                    fullName = $fullName
                    email = $email
                    groupName = $groupName
                    role = "Студент"
                    telegram = ""
                    craftRank = "Ассистент цеха"
                    rating = 5.0
                }
                $userJson = $userObj | ConvertTo-Json -Depth 3
                $rawJsonToSend = "{`"success`":true,`"token`":`"$token`",`"user`":$userJson}"
            }
            elseif ($urlPath -eq "/api/notifications" -and $method -eq "GET") {
                $shootsFile = Join-Path $PSScriptRoot "data\shoots.json"
                $shoots = if (Test-Path $shootsFile) { [System.IO.File]::ReadAllText($shootsFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json } else { @() }
                $invites = @()
                foreach ($s in $shoots) {
                    if ($s.crew) {
                        foreach ($c in $s.crew) {
                            if ($c.status -eq "PENDING") {
                                $invites += @{
                                    id = $c.id
                                    userId = $c.userId
                                    roleInShoot = $c.roleInShoot
                                    status = $c.status
                                    shoot = @{
                                        id = $s.id
                                        title = $s.title
                                        location = $s.location
                                        date = $s.date
                                    }
                                }
                            }
                        }
                    }
                }
                $invitesJson = if ($invites.Count -eq 0) {
                    "[]"
                } elseif ($invites.Count -eq 1) {
                    "[" + ($invites[0] | ConvertTo-Json -Depth 4) + "]"
                } else {
                    $invites | ConvertTo-Json -Depth 4
                }
                $rawJsonToSend = $invitesJson
            }
            elseif ($urlPath -eq "/api/crew/attendance" -and $method -eq "POST") {
                $shootsFile = Join-Path $PSScriptRoot "data\shoots.json"
                $parsed = if ($reqBody) { $reqBody | ConvertFrom-Json } else { @{} }
                $crewMemberId = $parsed.crewMemberId
                $attendance = $parsed.attendance
                
                if (Test-Path $shootsFile) {
                    $shoots = [System.IO.File]::ReadAllText($shootsFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
                    foreach ($s in $shoots) {
                        if ($s.crew) {
                            foreach ($c in $s.crew) {
                                if ($c.id -eq $crewMemberId -or $c.userId -eq $crewMemberId) {
                                    $c.attendance = $attendance
                                    break
                                }
                            }
                        }
                    }
                    $shootsJsonOut = $shoots | ConvertTo-Json -Depth 6
                    [System.IO.File]::WriteAllText($shootsFile, $shootsJsonOut, $utf8Encoding)
                }
                $rawJsonToSend = "{`"success`":true}"
            }
            elseif ($urlPath -eq "/api/crew/response" -and $method -eq "POST") {
                $shootsFile = Join-Path $PSScriptRoot "data\shoots.json"
                $parsed = if ($reqBody) { $reqBody | ConvertFrom-Json } else { @{} }
                $crewMemberId = $parsed.crewMemberId
                $newStatus = $parsed.status
                
                if (Test-Path $shootsFile) {
                    $shoots = [System.IO.File]::ReadAllText($shootsFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
                    foreach ($s in $shoots) {
                        if ($s.crew) {
                            foreach ($c in $s.crew) {
                                if ($c.id -eq $crewMemberId -or $c.userId -eq $crewMemberId) {
                                    $c.status = $newStatus
                                    break
                                }
                            }
                        }
                    }
                    $shootsJsonOut = $shoots | ConvertTo-Json -Depth 6
                    [System.IO.File]::WriteAllText($shootsFile, $shootsJsonOut, $utf8Encoding)
                }
                $rawJsonToSend = "{`"success`":true}"
            }
            elseif ($urlPath -eq "/api/cinemaboard" -and $method -eq "GET") {
                $rawJsonToSend = '{"timeBlock":1,"rating":4.8,"message":"Cinema quote","statusType":"praise"}'
            }
            elseif ($urlPath -eq "/api/notifications/vapid-public-key" -and $method -eq "GET") {
                $rawJsonToSend = "{`"publicKey`":`"BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkZsMlY_b448`"}"
            }
            elseif ($urlPath -eq "/api/admin/settings" -and $method -eq "POST") {
                $settingsFile = Join-Path $PSScriptRoot "data\settings.json"
                $parsed = if ($reqBody) { $reqBody | ConvertFrom-Json } else { @{} }
                $settingsJsonOut = $parsed | ConvertTo-Json -Depth 5
                [System.IO.File]::WriteAllText($settingsFile, $settingsJsonOut, $utf8Encoding)
                $rawJsonToSend = "{`"success`":true,`"settings`":$settingsJsonOut}"
            }
            elseif ($urlPath -eq "/api/shoots/complete" -and $method -eq "POST") {
                $helperScript = Join-Path $PSScriptRoot "data\shoots_helper.js"
                $nodeExe = "C:\Users\bad14\AppData\Local\Programs\com.brotorrent.torrent-client-utorrent\resources\app.asar.unpacked\node_modules\node\bin\node.exe"
                $tempFile = Join-Path $PSScriptRoot "data\temp_complete_$([Guid]::NewGuid().ToString('N')).json"
                try {
                    [System.IO.File]::WriteAllText($tempFile, $reqBody, $utf8Encoding)
                    if (Test-Path $nodeExe) {
                        $rawJsonToSend = & $nodeExe $helperScript complete $tempFile
                    } else {
                        $rawJsonToSend = "{`"success`":true}"
                    }
                } finally {
                    if (Test-Path $tempFile) { Remove-Item $tempFile -Force -ErrorAction SilentlyContinue }
                }
            }
            elseif ($urlPath -eq "/api/telegram/dispatch" -and $method -eq "POST") {
                $helperScript = Join-Path $PSScriptRoot "data\shoots_helper.js"
                $nodeExe = "C:\Users\bad14\AppData\Local\Programs\com.brotorrent.torrent-client-utorrent\resources\app.asar.unpacked\node_modules\node\bin\node.exe"
                $parsed = if ($reqBody) { $reqBody | ConvertFrom-Json } else { @{} }
                $targetShootId = if ($parsed.shootId) { $parsed.shootId } elseif ($parsed.shoot -and $parsed.shoot.id) { $parsed.shoot.id } else { "" }

                if ($targetShootId -and (Test-Path $nodeExe)) {
                    $rawJsonToSend = & $nodeExe $helperScript dispatch $targetShootId
                } else {
                    $rawJsonToSend = "{`"success`":true,`"report`":{`"deliveredCount`":0,`"botTokenConfigured`":false}}"
                }
            }
            elseif ($urlPath -eq "/api/telegram/test" -and $method -eq "POST") {
                $settingsFile = Join-Path $PSScriptRoot "data\settings.json"
                $token = ""
                $defaultChat = ""
                if (Test-Path $settingsFile) {
                    $setObj = [System.IO.File]::ReadAllText($settingsFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
                    $token = $setObj.telegramBotToken
                    $defaultChat = $setObj.defaultChatId
                }
                $parsed = if ($reqBody) { $reqBody | ConvertFrom-Json } else { @{} }
                if ($parsed.token) { $token = $parsed.token }
                $targetChatString = if ($parsed.chatId) { $parsed.chatId } else { $defaultChat }

                if ($token -and $targetChatString) {
                    $chatList = @($targetChatString -split "[\s,;\n\r]+" | Where-Object { [string]::IsNullOrWhiteSpace($_) -eq $false })
                    $successCount = 0
                    $lastError = ""
                    foreach ($cId in $chatList) {
                        try {
                            $tgUri = "https://api.telegram.org/bot$token/sendMessage"
                            $testMsg = "<b>Медиацентр КП11 // Тест связи</b>`n`nТестовое оповещение успешно доставлено в Telegram!`nБот готов к оперативной рассылке вызывных листов."
                            $tgBody = @{ chat_id = $cId; text = $testMsg; parse_mode = "HTML" } | ConvertTo-Json
                            Invoke-RestMethod -Uri $tgUri -Method Post -Body $tgBody -ContentType "application/json" | Out-Null
                            $successCount++
                        } catch {
                            $lastError = $_.Exception.Message
                        }
                    }
                    if ($successCount -gt 0) {
                        $rawJsonToSend = "{`"success`":true,`"message`":`"Тестовое оповещение доставлено в $successCount чатов!`"}"
                    } else {
                        $rawJsonToSend = "{`"success`":false,`"error`":`"Telegram API Error: $($lastError.Replace('"', ' '))`"}"
                    }
                } else {
                    $rawJsonToSend = "{`"success`":false,`"error`":`"Укажите токен бота и Chat ID`"}"
                }
            }
            else {
                $rawJsonToSend = "{`"success`":true}"
            }

            if ([string]::IsNullOrEmpty($rawJsonToSend)) {
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
        if ($urlPath -eq "/favicon.ico") {
            $urlPath = "/img/logo_red.png"
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
