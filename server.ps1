<#
  BiteWise 2.0 Local Full-Stack Server (Zero Dependencies — Native Windows PowerShell)
  - Serves the BiteWise web app on http://localhost:8765/
  - Automatically stores ALL registered users (ID, Name, Email, Password, BMI, Calories) in users_database.txt
  - Sends REAL 6-digit OTP verification emails via Gmail SMTP (smtp.gmail.com:587 TLS)
  - Persists Google OAuth Client ID & Gmail SMTP settings in server_config.json
#>

[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8765
$usersJsonPath = Join-Path $root "users_store.json"
$usersTxtPath  = Join-Path $root "users_database.txt"
$otpLogPath    = Join-Path $root "otp_log.txt"
$configPath    = Join-Path $root "server_config.json"

# In-memory OTP store: email -> @{ code, expiresAt, verified }
$otpStore = @{}

function Load-Config {
  if (Test-Path $configPath) {
    try { return (Get-Content -Raw -Encoding UTF8 $configPath | ConvertFrom-Json) } catch {}
  }
  return [PSCustomObject]@{
    googleClientId  = ""
    smtpEmail       = ""
    smtpAppPassword = ""
    emailjsServiceId  = ""
    emailjsTemplateId = ""
    emailjsPublicKey  = ""
  }
}

function Save-Config($cfg) {
  $json = $cfg | ConvertTo-Json -Depth 5
  [System.IO.File]::WriteAllText($configPath, $json, [System.Text.UTF8Encoding]::new($false))
}

function Load-Users {
  $list = New-Object System.Collections.ArrayList
  if (Test-Path $usersJsonPath) {
    try {
      $parsed = Get-Content -Raw -Encoding UTF8 $usersJsonPath | ConvertFrom-Json
      if ($null -ne $parsed) {
        foreach ($item in @($parsed)) {
          if ($null -ne $item -and $item.id) { [void]$list.Add($item) }
        }
      }
      if ($list.Count -gt 0) { return ,$list }
    } catch {}
  }
  [void]$list.Add([PSCustomObject]@{
    id = "BW-1001"
    name = "أحمد محمد"
    email = "demo@bitewise.eg"
    password = "1234"
    provider = "local"
    picture = ""
    emailVerified = $true
    age = 21
    gender = "male"
    height = 176
    weight = 75
    activity = 1.55
    goal = "maintain"
    calorieMode = "auto"
    manualCalories = 2500
    macroPreset = "balanced"
    onboardingComplete = $true
    selectedFoodIds = @(1, 151, 154, 158, 21, 85, 116, 195)
    diaries = @{}
    createdAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  })
  Save-Users $list
  return ,$list
}

function Save-Users($usersList) {
  $arr = @()
  foreach ($item in $usersList) {
    if ($null -ne $item -and $item.id) { $arr += $item }
  }
  $json = ConvertTo-Json -InputObject @($arr) -Depth 10
  if ($arr.Count -eq 1) { $json = "[" + $json.TrimStart("[").TrimEnd("]") + "]" }
  [System.IO.File]::WriteAllText($usersJsonPath, $json, [System.Text.UTF8Encoding]::new($false))

  # AUTOMATICALLY write clean, human-readable users_database.txt
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine("==========================================================================")
  [void]$sb.AppendLine("  BITEWISE USERS DATABASE (Auto-Updated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))")
  [void]$sb.AppendLine("  Total Accounts: $($arr.Count)")
  [void]$sb.AppendLine("==========================================================================")
  [void]$sb.AppendLine("")

  foreach ($u in $arr) {
    $h = if ($u.height) { [double]$u.height } else { 175 }
    $w = if ($u.weight) { [double]$u.weight } else { 75 }
    $bmi = [Math]::Round($w / (($h / 100.0) * ($h / 100.0)), 1)
    [void]$sb.AppendLine("--------------------------------------------------------------------------")
    [void]$sb.AppendLine("User ID        : $($u.id)")
    [void]$sb.AppendLine("Full Name      : $($u.name)")
    [void]$sb.AppendLine("Email          : $($u.email)")
    [void]$sb.AppendLine("Password       : $(if ($u.password) { $u.password } else { '(Google OAuth)' })")
    [void]$sb.AppendLine("Auth Provider  : $($u.provider) | Email Verified: $($u.emailVerified)")
    [void]$sb.AppendLine("Body Profile   : Gender=$($u.gender) | Age=$($u.age) | Height=$($u.height)cm | Weight=$($u.weight)kg | BMI=$bmi")
    [void]$sb.AppendLine("Calories Setup : Mode=$($u.calorieMode) | Manual=$($u.manualCalories) kcal | Goal=$($u.goal) | Activity=$($u.activity)")
    [void]$sb.AppendLine("Created At     : $($u.createdAt)")
  }
  [void]$sb.AppendLine("--------------------------------------------------------------------------")
  [System.IO.File]::WriteAllText($usersTxtPath, $sb.ToString(), [System.Text.UTF8Encoding]::new($false))
}

function Send-GmailOtp($toEmail, $otpCode, $cfg) {
  if (-not $cfg.smtpEmail -or -not $cfg.smtpAppPassword) {
    return @{ sent = $false; reason = "SMTP_NOT_CONFIGURED" }
  }
  try {
    $mail = New-Object System.Net.Mail.MailMessage
    $mail.From = New-Object System.Net.Mail.MailAddress($cfg.smtpEmail, "BiteWise Nutrition")
    $mail.To.Add($toEmail)
    $mail.Subject = "BiteWise Verification Code (OTP): $otpCode"
    $mail.IsBodyHtml = $true
    $mail.Body = @"
<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 28px; border: 1px solid #e5e7eb; border-radius: 16px; background: #ffffff; direction: rtl; text-align: right;">
  <h2 style="color: #059669; margin: 0 0 10px;">BiteWise — رمز التحقق من البريد الإلكتروني</h2>
  <p style="color: #374151; font-size: 15px;">أهلاً بك في BiteWise! استخدم رمز التحقق التالي لتفعيل حسابك:</p>
  <div style="background: #f0fdf4; border: 2px dashed #10b981; border-radius: 12px; padding: 18px; text-align: center; margin: 20px 0;">
    <span style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #065f46; font-family: monospace;">$otpCode</span>
  </div>
  <p style="color: #6b7280; font-size: 13px;">الرمز صالح لمدة 5 دقائق فقط. إذا لم تطلب هذا الرمز يمكنك تجاهل هذه الرسالة.</p>
</div>
"@

    $smtp = New-Object System.Net.Mail.SmtpClient("smtp.gmail.com", 587)
    $smtp.EnableSsl = $true
    $smtp.UseDefaultCredentials = $false
    $smtp.Credentials = New-Object System.Net.NetworkCredential($cfg.smtpEmail, ($cfg.smtpAppPassword -replace '\s+', ''))
    $smtp.Send($mail)
    $mail.Dispose()
    $smtp.Dispose()
    return @{ sent = $true; reason = "SENT_VIA_GMAIL_SMTP" }
  } catch {
    return @{ sent = $false; reason = $_.Exception.Message }
  }
}

function Send-Json($res, $obj, $status = 200) {
  $res.StatusCode = $status
  $res.ContentType = "application/json; charset=utf-8"
  $res.Headers.Add("Access-Control-Allow-Origin", "*")
  $res.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
  $res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  $json = ConvertTo-Json -InputObject $obj -Depth 10
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Read-BodyJson($req) {
  $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
  $raw = $reader.ReadToEnd()
  $reader.Close()
  if (-not $raw) { return $null }
  return ($raw | ConvertFrom-Json)
}

# Initialize users_database.txt immediately on startup
$null = Load-Users

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Output "BiteWise 2.0 Backend + Web Server running at http://localhost:$port/"
Write-Output "Auto-saving user credentials to: $usersTxtPath"

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".txt"  = "text/plain; charset=utf-8"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".png"  = "image/png"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    $path = $req.Url.LocalPath
    $method = $req.HttpMethod

    if ($method -eq "OPTIONS") {
      Send-Json $res @{ ok = $true } 200
      $res.Close()
      continue
    }

    # ==================== API ROUTES ====================
    if ($path -eq "/api/health") {
      $cfg = Load-Config
      Send-Json $res @{
        ok = $true
        smtpConfigured = [bool]($cfg.smtpEmail -and $cfg.smtpAppPassword)
        googleConfigured = [bool]($cfg.googleClientId)
        usersFile = "users_database.txt"
      }
      $res.Close()
      continue
    }

    if ($path -eq "/api/config" -and $method -eq "GET") {
      $cfg = Load-Config
      Send-Json $res @{
        googleClientId = $cfg.googleClientId
        smtpEmail = $cfg.smtpEmail
        smtpConfigured = [bool]($cfg.smtpEmail -and $cfg.smtpAppPassword)
        emailjsServiceId = $cfg.emailjsServiceId
        emailjsTemplateId = $cfg.emailjsTemplateId
        emailjsPublicKey = $cfg.emailjsPublicKey
      }
      $res.Close()
      continue
    }

    if ($path -eq "/api/config" -and $method -eq "POST") {
      $body = Read-BodyJson $req
      $cfg = Load-Config
      if ($null -ne $body.googleClientId) { $cfg.googleClientId = $body.googleClientId.Trim() }
      if ($null -ne $body.smtpEmail) { $cfg.smtpEmail = $body.smtpEmail.Trim() }
      if ($null -ne $body.smtpAppPassword -and $body.smtpAppPassword.Trim() -ne "") { $cfg.smtpAppPassword = $body.smtpAppPassword.Trim() }
      if ($null -ne $body.emailjsServiceId) { $cfg.emailjsServiceId = $body.emailjsServiceId.Trim() }
      if ($null -ne $body.emailjsTemplateId) { $cfg.emailjsTemplateId = $body.emailjsTemplateId.Trim() }
      if ($null -ne $body.emailjsPublicKey) { $cfg.emailjsPublicKey = $body.emailjsPublicKey.Trim() }
      Save-Config $cfg
      Send-Json $res @{
        ok = $true
        smtpConfigured = [bool]($cfg.smtpEmail -and $cfg.smtpAppPassword)
        googleConfigured = [bool]($cfg.googleClientId)
      }
      $res.Close()
      continue
    }

    if ($path -eq "/api/users" -and $method -eq "GET") {
      $users = Load-Users
      Send-Json $res @{ ok = $true; users = $users }
      $res.Close()
      continue
    }

    if ($path -eq "/api/users/sync" -and $method -eq "POST") {
      $body = Read-BodyJson $req
      $users = Load-Users
      $incoming = $body.user
      if ($null -eq $incoming -or -not $incoming.id) {
        Send-Json $res @{ ok = $false; error = "Invalid user object" } 400
        $res.Close()
        continue
      }
      $idx = -1
      for ($i = 0; $i -lt $users.Count; $i++) {
        if ($users[$i].id -eq $incoming.id) { $idx = $i; break }
      }
      if ($idx -ge 0) { $users[$idx] = $incoming } else { [void]$users.Add($incoming) }
      Save-Users $users
      Send-Json $res @{ ok = $true; savedToFile = "users_database.txt"; totalUsers = $users.Count }
      $res.Close()
      continue
    }

    if ($path -eq "/api/otp/send" -and $method -eq "POST") {
      $body = Read-BodyJson $req
      $email = ($body.email + "").Trim().ToLower()
      if (-not $email -or $email -notmatch "@") {
        Send-Json $res @{ ok = $false; error = "يرجى إدخال بريد إلكتروني صحيح" } 400
        $res.Close()
        continue
      }
      $code = "{0:D6}" -f (Get-Random -Minimum 100000 -Maximum 999999)
      $otpStore[$email] = @{
        code = $code
        expiresAt = (Get-Date).AddMinutes(5)
      }

      # Log OTP locally for debugging
      $logLine = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] OTP for $email => $code`r`n"
      [System.IO.File]::AppendAllText($otpLogPath, $logLine, [System.Text.UTF8Encoding]::new($false))

      $cfg = Load-Config
      $smtpRes = Send-GmailOtp $email $code $cfg

      if ($smtpRes.sent) {
        Send-Json $res @{
          ok = $true
          deliveredVia = "gmail_smtp"
          message = "تم إرسال رمز التحقق (OTP) بنجاح إلى بريدك $email"
        }
      } else {
        Send-Json $res @{
          ok = $true
          deliveredVia = "local_fallback"
          devOtp = $code
          reason = $smtpRes.reason
          message = "تم توليد رمز OTP (لتوصيله مباشرة إلى Gmail أدخل Gmail App Password في الإعدادات)"
        }
      }
      $res.Close()
      continue
    }

    if ($path -eq "/api/otp/verify" -and $method -eq "POST") {
      $body = Read-BodyJson $req
      $email = ($body.email + "").Trim().ToLower()
      $code = ($body.code + "").Trim()

      if (-not $otpStore.ContainsKey($email)) {
        Send-Json $res @{ ok = $false; error = "لم يتم إرسال رمز تحقق لهذا البريد أو انتهت صلاحيته." } 400
        $res.Close()
        continue
      }
      $rec = $otpStore[$email]
      if ((Get-Date) -gt $rec.expiresAt) {
        $otpStore.Remove($email)
        Send-Json $res @{ ok = $false; error = "انتهت صلاحية الرمز (5 دقائق). اضغط إعادة إرسال." } 400
        $res.Close()
        continue
      }
      if ($rec.code -ne $code) {
        Send-Json $res @{ ok = $false; error = "رمز التحقق غير صحيح. تأكد من الأرقام الـ 6 وحاول مجدداً." } 400
        $res.Close()
        continue
      }
      $otpStore.Remove($email)
      Send-Json $res @{ ok = $true; verified = $true }
      $res.Close()
      continue
    }

    if ($path -eq "/api/admin/food-photo" -and $method -eq "POST") {
      $body = Read-BodyJson $req
      $adminEmail = ($body.adminEmail + "").Trim().ToLower()
      if ($adminEmail -ne "alio2sama21@gmail.com") {
        Send-Json $res @{ ok = $false; error = "Unauthorized: Admin access required (alio2sama21@gmail.com)" } 403
        $res.Close()
        continue
      }
      $foodId = [int]$body.foodId
      $newPhoto = ($body.photoUrl + "").Trim()

      # If admin uploaded a Base64 Data URL image, save it cleanly as a local file in ./images/custom/
      if ($newPhoto -match "^data:image\/([a-zA-Z0-9+]+);base64,(.+)$") {
        $b64Data = $Matches[2]
        $customDir = Join-Path $root "images\custom"
        if (-not (Test-Path $customDir)) { New-Item -ItemType Directory -Path $customDir -Force | Out-Null }
        $fileName = "food_${foodId}_$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()).jpg"
        $filePath = Join-Path $customDir $fileName
        [System.IO.File]::WriteAllBytes($filePath, [Convert]::FromBase64String($b64Data))
        $newPhoto = "./images/custom/$fileName"
      }

      $dbJsonPath = Join-Path $root "egyptian_food_nutrition_with_images_v4.json"
      $foodsJsPath = Join-Path $root "foods-data.js"
      if (Test-Path $dbJsonPath) {
        $dbObj = Get-Content $dbJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($f in $dbObj.foods) {
          if ([int]$f.id -eq $foodId) {
            $f.image_url = $newPhoto
            $f | Add-Member -NotePropertyName "photo_url" -NotePropertyValue $newPhoto -Force
            break
          }
        }
        $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
        $jsonOut = $dbObj | ConvertTo-Json -Depth 10
        [System.IO.File]::WriteAllText($dbJsonPath, $jsonOut, $utf8NoBom)
        [System.IO.File]::WriteAllText($foodsJsPath, ("window.BITEWISE_FOOD_DB = " + $jsonOut + ";"), $utf8NoBom)
      }

      Send-Json $res @{ ok = $true; foodId = $foodId; savedPhotoUrl = $newPhoto }
      $res.Close()
      continue
    }

    # ==================== STATIC FILES ====================
    if ($path -eq "/") { $path = "/index.html" }
    $rel = $path.TrimStart("/").Replace("/", "\")
    $full = Join-Path $root $rel

    # Protect private server config from direct static download
    if ($rel -match "server_config\.json|users_store\.json|otp_log\.txt") {
      $res.StatusCode = 403
      $msg = [System.Text.Encoding]::UTF8.GetBytes("Forbidden")
      $res.OutputStream.Write($msg, 0, $msg.Length)
      $res.Close()
      continue
    }

    if ((Test-Path $full) -and -not (Get-Item $full).PSIsContainer) {
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $res.ContentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("Not Found")
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
    $res.Close()
  }
} finally {
  $listener.Stop()
}
