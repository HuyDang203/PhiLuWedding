# Minimal Chrome DevTools Protocol driver (PowerShell).
# Used to measure the real rendered geometry of the homepage venue
# cards and to capture screenshots, so the alignment fix is based on
# measured values instead of guesses.

param(
    [Parameter(Mandatory = $true)][string]$Url,
    [string]$Expression = "",
    [string]$ExpressionFile = "",
    [string]$ScreenshotPath = "",
    [int]$Width = 1440,
    [int]$Height = 900,
    [int]$DeviceScaleFactor = 1,
    [string]$UserAgent = "",
    [int]$ChromePort = 9222,
    [string]$ProfileDir = "D:\PhiLuWedding\.tmp-cdp\profile-venue"
)

$ErrorActionPreference = "Stop"

if ($ExpressionFile -and $ExpressionFile -ne "") {
    $Expression = Get-Content -LiteralPath $ExpressionFile -Raw
}

function Send-Cdp {
    param(
        [System.Net.WebSockets.ClientWebSocket]$Socket,
        [int]$Id,
        [string]$Method,
        [hashtable]$Params
    )
    $payload = @{ id = $Id; method = $Method; params = $Params } | ConvertTo-Json -Depth 20 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $seg = [ArraySegment[byte]]::new($bytes)
    $Socket.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
}

function Read-Cdp {
    param(
        [System.Net.WebSockets.ClientWebSocket]$Socket,
        [int]$TimeoutMs = 30000
    )
    $cts = [Threading.CancellationTokenSource]::new($TimeoutMs)
    $buffer = New-Object byte[] 1048576
    $ms = [System.IO.MemoryStream]::new()
    while ($true) {
        $seg = [ArraySegment[byte]]::new($buffer)
        $res = $Socket.ReceiveAsync($seg, $cts.Token).GetAwaiter().GetResult()
        if ($res.Count -gt 0) { $ms.Write($buffer, 0, $res.Count) }
        if ($res.EndOfMessage) { break }
    }
    $text = [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
    $ms.Dispose()
    return $text
}

function Invoke-Cdp {
    param(
        [System.Net.WebSockets.ClientWebSocket]$Socket,
        [int]$Id,
        [string]$Method,
        [hashtable]$Params
    )
    Send-Cdp -Socket $Socket -Id $Id -Method $Method -Params $Params
    while ($true) {
        $raw = Read-Cdp -Socket $Socket
        $obj = $raw | ConvertFrom-Json
        if ($obj.id -eq $Id) { return $obj }
    }
}

# ---- launch Chrome ------------------------------------------------------
if (Test-Path $ProfileDir) { Remove-Item $ProfileDir -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null

$chromeArgs = @(
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=$ChromePort",
    "--user-data-dir=$ProfileDir",
    "--window-size=$Width,$Height"
)
if ($UserAgent) { $chromeArgs += "--user-agent=$UserAgent" }

$chrome = Start-Process -FilePath "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" `
    -ArgumentList $chromeArgs -PassThru -WindowStyle Hidden

try {
    # wait for the debugger endpoint
    $targets = $null
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 500
        try {
            $targets = Invoke-RestMethod -Uri "http://127.0.0.1:$ChromePort/json/list" -TimeoutSec 5
            if ($targets) { break }
        } catch { }
    }
    if (-not $targets) { throw "Chrome debugger did not come up on port $ChromePort" }

    $page = $targets | Where-Object { $_.type -eq "page" } | Select-Object -First 1
    if (-not $page) { throw "No page target" }
    $wsUrl = $page.webSocketDebuggerUrl

    $ws = [System.Net.WebSockets.ClientWebSocket]::new()
    $ws.ConnectAsync([Uri]$wsUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()

    Invoke-Cdp -Socket $ws -Id 1 -Method "Page.enable" | Out-Null
    Invoke-Cdp -Socket $ws -Id 2 -Method "Runtime.enable" | Out-Null

    $emParams = @{
        width = $Width
        height = $Height
        deviceScaleFactor = $DeviceScaleFactor
        mobile = ($UserAgent -like "*Android*")
    }
    Invoke-Cdp -Socket $ws -Id 3 -Method "Emulation.setDeviceMetricsOverride" -Params $emParams | Out-Null

    Invoke-Cdp -Socket $ws -Id 4 -Method "Page.navigate" -Params @{ url = $Url } | Out-Null
    Start-Sleep -Seconds 3

    $eval = Invoke-Cdp -Socket $ws -Id 5 -Method "Runtime.evaluate" -Params @{
        expression = $Expression
        returnByValue = $true
        awaitPromise = $true
    }

    if ($eval.result.result.value) {
        $eval.result.result.value | ConvertTo-Json -Depth 20
    } elseif ($eval.result.exceptionDetails) {
        "JS EXCEPTION: $($eval.result.exceptionDetails.text) $($eval.result.exceptionDetails.exception.description)"
    } else {
        "NO VALUE RETURNED"
    }

    if ($ScreenshotPath -and $ScreenshotPath -ne "") {
        $shot = Invoke-Cdp -Socket $ws -Id 6 -Method "Page.captureScreenshot" -Params @{ format = "png"; captureBeyondViewport = $true }
        $bytes = [Convert]::FromBase64String($shot.result.data)
        [IO.File]::WriteAllBytes($ScreenshotPath, $bytes)
        "SCREENSHOT: $ScreenshotPath"
    }

    $ws.Dispose()
}
finally {
    if ($chrome -and -not $chrome.HasExited) { Stop-Process -Id $chrome.Id -Force -ErrorAction SilentlyContinue }
}
