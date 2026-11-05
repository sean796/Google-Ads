# One local path: Docker + WP + Vite (scripts/dev.cjs) + host worker; optional browser.
param(
    [switch]$OpenBrowser,
    [switch]$SkipDev,
    [switch]$SkipDocker,
    [int]$HealthTimeoutSec = 120
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path $PSScriptRoot -Parent
$configPath = Join-Path $PSScriptRoot "local-wp-staging.config.json"
$examplePath = Join-Path $PSScriptRoot "local-wp-staging.config.example.json"
$viteLog = Join-Path $repoRoot ".local-dev-vite.log"
$vitePidFile = Join-Path $repoRoot ".local-dev-vite.pid"
$timeoutSec = $HealthTimeoutSec

$flowbieTmp = "B:\Flowbie-tmp"
New-Item -ItemType Directory -Force -Path @(
    (Join-Path $flowbieTmp "chatgpt-audit-jobs"),
    (Join-Path $flowbieTmp "browser-automation-jobs"),
    (Join-Path $flowbieTmp "post-creator-jobs"),
    (Join-Path $flowbieTmp "ld-jobs")
) | Out-Null
if (-not $env:CHATGPT_AUDIT_JOBS_DIR) { $env:CHATGPT_AUDIT_JOBS_DIR = Join-Path $flowbieTmp "chatgpt-audit-jobs" }
if (-not $env:BROWSER_AUTOMATION_JOBS_DIR) { $env:BROWSER_AUTOMATION_JOBS_DIR = Join-Path $flowbieTmp "browser-automation-jobs" }
if (-not $env:POST_CREATOR_SERVER_JOBS_DIR) { $env:POST_CREATOR_SERVER_JOBS_DIR = Join-Path $flowbieTmp "post-creator-jobs" }
if (-not $env:LOCAL_DOMINATOR_JOBS_DIR) { $env:LOCAL_DOMINATOR_JOBS_DIR = Join-Path $flowbieTmp "ld-jobs" }

function Write-Step([string]$Message) {
    Write-Host $Message -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host $Message -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host $Message -ForegroundColor Yellow
}

function Get-LocalConfig() {
    if (-not (Test-Path $configPath)) {
        if (Test-Path $examplePath) {
            Copy-Item $examplePath $configPath
            Write-Warn "Created scripts/local-wp-staging.config.json from example."
        } else {
            Write-Host "Missing scripts/local-wp-staging.config.json" -ForegroundColor Red
            Write-Host "One-time: npm run setup:local-wp"
            exit 1
        }
    }
    return Get-Content $configPath -Raw | ConvertFrom-Json
}

$config = Get-LocalConfig
$siteHost = [string]$config.siteHost
$siteUrl = ([string]$config.siteUrl).TrimEnd("/")
$wpSiteDir = Split-Path ([string]$config.wpRoot) -Parent
if (-not $wpSiteDir -or -not (Test-Path $wpSiteDir)) {
    $wpSiteDir = Join-Path $env:USERPROFILE "wpstaging\sites\$siteHost"
}
$pluginsDir = [string]$config.pluginsDir
$appUrl = if ($config.viteDevUrl) { [string]$config.viteDevUrl } else { "http://localhost:8080/" }
$appUrl = $appUrl -replace '#.*$', ''
if ($appUrl -notmatch '/$') { $appUrl = "$appUrl/" }

$pluginJunctionsStale = $false
$expectedPlugins = @{
    "neo-pulse-wp"  = Join-Path $repoRoot "wordpress-plugins\neo-pulse-wp"
    "neo-pulse-app" = Join-Path $repoRoot "wordpress-plugins\neo-pulse-app"
}
foreach ($entry in $expectedPlugins.GetEnumerator()) {
    $linkPath = Join-Path $pluginsDir $entry.Key
    if (-not (Test-Path $linkPath)) {
        $pluginJunctionsStale = $true
        break
    }
    $item = Get-Item $linkPath -Force
    if (-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        $pluginJunctionsStale = $true
        break
    }
    $target = ($item.Target | Select-Object -First 1)
    if (-not $target -or ([IO.Path]::GetFullPath($target) -ne [IO.Path]::GetFullPath($entry.Value))) {
        $pluginJunctionsStale = $true
        break
    }
}

function Invoke-DockerCli {
    param(
        [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
        [string[]]$Args
    )
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        & docker @Args 2>&1 | Out-Null
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

function Test-DockerReady {
    return (Invoke-DockerCli info --format "{{.ServerVersion}}") -eq 0
}

function Start-DockerDesktopEngine {
    $dockerDesktop = @(
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
        "$env:LOCALAPPDATA\Programs\Docker\Docker\Docker Desktop.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if (-not $dockerDesktop) {
        Write-Host "Docker Desktop is not installed or could not be found." -ForegroundColor Red
        exit 1
    }

    Write-Step "Docker engine is offline. Starting Docker Desktop..."
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        $desktopStart = & docker desktop start 2>&1
        foreach ($line in @($desktopStart)) {
            if ($line) { Write-Host $line }
        }
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "docker desktop start unavailable; launching Docker Desktop app..."
            Start-Process -FilePath $dockerDesktop | Out-Null
        }
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

function Wait-DockerReady([int]$MaxSeconds) {
    $deadline = (Get-Date).AddSeconds($MaxSeconds)
    $waitStarted = Get-Date
    while ((Get-Date) -lt $deadline) {
        if (Test-DockerReady) { return $true }
        $elapsed = [int](((Get-Date) - $waitStarted).TotalSeconds)
        Write-Host "  Waiting for Docker engine... ${elapsed}s" -ForegroundColor DarkGray
        Start-Sleep -Seconds 5
    }
    return (Test-DockerReady)
}

function Wait-HttpOk([string]$Url, [int]$Sec) {
    $deadline = (Get-Date).AddSeconds($Sec)
    while ((Get-Date) -lt $deadline) {
        $code = curl.exe -k -s -o NUL -w "%{http_code}" $Url 2>$null
        if ($code -match "^(200|301|302)$") { return $true }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Test-PortListen([int]$Port) {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Stop-PreviousVite {
    if (Test-Path $vitePidFile) {
        $oldPid = (Get-Content $vitePidFile -Raw).Trim()
        if ($oldPid -match '^\d+$') {
            Stop-Process -Id ([int]$oldPid) -Force -ErrorAction SilentlyContinue
        }
        Remove-Item $vitePidFile -Force -ErrorAction SilentlyContinue
    }
    Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { $_.OwningProcess } |
        Select-Object -Unique |
        ForEach-Object {
            Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        }
    Start-Sleep -Seconds 1
}

function Start-ViteDevServer {
    if (Test-PortListen 8080) {
        Write-Host "Port 8080 is in use. Stopping previous Vite..." -ForegroundColor Yellow
        Stop-PreviousVite
    }

    Remove-Item Env:LOCAL_DEV_VITE_FORCE -ErrorAction SilentlyContinue

    "" | Set-Content -Path $viteLog -Encoding utf8
    $viteErrLog = Join-Path $repoRoot ".local-dev-vite.err.log"
    if (Test-Path $viteErrLog) {
        Remove-Item $viteErrLog -Force -ErrorAction SilentlyContinue
    }

    $viteProc = Start-Process `
        -FilePath "node" `
        -ArgumentList @("scripts/dev.cjs") `
        -WorkingDirectory $repoRoot `
        -PassThru `
        -WindowStyle Hidden `
        -RedirectStandardOutput $viteLog `
        -RedirectStandardError $viteErrLog

    Set-Content -Path $vitePidFile -Value $viteProc.Id -NoNewline
    $script:ViteDevProcess = $viteProc
}

function Show-ViteStartupFailure {
    Write-Host "Vite dev process exited before port 8080 was ready." -ForegroundColor Red
    $viteErrLog = Join-Path $repoRoot ".local-dev-vite.err.log"
    if (Test-Path $viteErrLog) {
        Write-Host "--- .local-dev-vite.err.log ---" -ForegroundColor DarkYellow
        Get-Content $viteErrLog -Tail 30 | ForEach-Object { Write-Host $_ }
    } else {
        Write-Host "No .local-dev-vite.err.log (check .local-dev-vite.log)." -ForegroundColor DarkYellow
    }
    exit 1
}

function Clear-VitePrebundleCache {
    $viteCache = Join-Path $repoRoot "node_modules\.vite"
    if (Test-Path $viteCache) {
        Write-Warn "Clearing stale Vite prebundle cache ($viteCache)..."
        Remove-Item -LiteralPath $viteCache -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Assert-ViteRepoRoot {
    param([switch]$AfterCacheClearRetry)

    $expected = [IO.Path]::GetFullPath($repoRoot).TrimEnd('\')
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $raw = curl.exe -s "http://127.0.0.1:8080/__neo-pulse/dev-meta.json" 2>$null
            if ($raw) {
                $meta = $raw | ConvertFrom-Json
                $served = [IO.Path]::GetFullPath([string]$meta.repoRoot).TrimEnd('\')
                if ($served -eq $expected) {
                    Write-Ok "Vite is serving this repo: $expected"
                    return
                }
                if (-not $AfterCacheClearRetry) {
                    Write-Host "Port 8080 repo mismatch (stale prebundle or wrong checkout). Retrying after cache clear..." -ForegroundColor Yellow
                    Write-Host "  Expected: $expected"
                    Write-Host "  Actual:   $served"
                    Clear-VitePrebundleCache
                    $env:LOCAL_DEV_VITE_FORCE = "1"
                    Stop-PreviousVite
                    Start-ViteDevServer
                    if (-not (Wait-HttpOk "http://127.0.0.1:8080/" $timeoutSec)) {
                        Write-Host "Vite did not restart on 8080." -ForegroundColor Red
                        exit 1
                    }
                    Assert-ViteRepoRoot -AfterCacheClearRetry
                    return
                }
                Write-Host "Port 8080 is serving a different checkout:" -ForegroundColor Red
                Write-Host "  Expected: $expected"
                Write-Host "  Actual:   $served"
                Write-Host "Close the other dev server, run scripts/remove-legacy-clone.ps1, then start-neopulse-local.bat again."
                Stop-PreviousVite
                exit 1
            }
        } catch {
            # retry until timeout
        }
        Start-Sleep -Seconds 2
    }
    Write-Warn "Could not verify dev-meta.json (Vite may still be starting)."
}

function Assert-VitePipelineUi {
    try {
        $uiRaw = curl.exe -s "http://127.0.0.1:8080/__neo-pulse/dev-ui.json" 2>$null
        if ($uiRaw) {
            $ui = $uiRaw | ConvertFrom-Json
            if ([string]$ui.aiModelsPanel -ne "pipeline-agents-v3") {
                Write-Host "dev-ui.json: expected aiModelsPanel pipeline-agents-v3, got $($ui.aiModelsPanel)" -ForegroundColor Red
                Stop-PreviousVite
                exit 1
            }
        }
    } catch {
        Write-Warn "Could not read __neo-pulse/dev-ui.json"
    }

    Write-Ok "AI Models UI is the pipeline-agents-v3 panel."
}

function Start-LocalWorkerServer {
    $workerPort = 10000
    if (Test-PortListen $workerPort) {
        Write-Ok "Host worker already listening on http://localhost:$workerPort"
        return
    }

    Write-Step "Starting host worker (npm run start:ld-worker on :$workerPort)..."
    $workerLog = Join-Path $repoRoot ".local-dev-worker.log"
    $workerCmd = "Set-Location -LiteralPath '$repoRoot'; npm run start:ld-worker *>> '$workerLog'"
    Start-Process powershell -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-Command", $workerCmd
    ) -WindowStyle Minimized | Out-Null

    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-PortListen $workerPort) {
            Write-Ok "Host worker ready at http://localhost:$workerPort"
            return
        }
        Start-Sleep -Seconds 2
    }
    Write-Warn "Host worker did not start on port $workerPort. See .local-dev-worker.log"
}

Write-Step "NEO Pulse local startup"
Write-Host "  Repo:     $repoRoot"
Write-Host "  WP site:  $siteUrl"
Write-Host "  Dev app:  $appUrl"
Write-Host ""

if (-not $SkipDocker) {
    if (-not (Test-DockerReady)) {
        Start-DockerDesktopEngine
        if (-not (Wait-DockerReady ([Math]::Max($timeoutSec, 360)))) {
            Write-Host "Docker did not become ready in time." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Ok "Docker is ready"
    }

    if (-not (Test-Path (Join-Path $wpSiteDir "docker-compose.yml"))) {
        Write-Host "Missing docker-compose.yml in $wpSiteDir" -ForegroundColor Red
        exit 1
    }

    Write-Step "Starting neopulse.local containers..."
    Push-Location $wpSiteDir
    try {
        & docker compose up -d
        if ($LASTEXITCODE -ne 0) {
            Write-Host "docker compose up failed." -ForegroundColor Red
            exit 1
        }
    } finally {
        Pop-Location
    }

    Write-Step "Ensuring ffmpeg in the PHP container (Video Generator stitch)..."
    & docker exec -u root wpstg-neopulse-local-php sh -c "command -v ffmpeg >/dev/null 2>&1 || apk add --no-cache ffmpeg"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ffmpeg install in wpstg-neopulse-local-php failed." -ForegroundColor Red
        exit 1
    }

    Write-Step "Waiting for $siteUrl/ ..."
    if (-not (Wait-HttpOk "$siteUrl/" $timeoutSec)) {
        Write-Host "$siteUrl did not respond." -ForegroundColor Red
        exit 1
    }
    Write-Ok "$siteUrl is up"
} else {
    Write-Warn "Skipped Docker (-SkipDocker)"
}

if ($pluginJunctionsStale) {
    Write-Warn "Plugin junctions do not match this repo. Re-syncing..."
    & (Join-Path $PSScriptRoot "sync-local-wp-plugins.ps1")
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not $SkipDev) {
    Write-Step "Starting Vite on port 8080..."
    Stop-PreviousVite
    Start-ViteDevServer

    $viteWaitStarted = Get-Date
    $viteUp = $false
    $viteDeadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $viteDeadline) {
        if ($script:ViteDevProcess -and $script:ViteDevProcess.HasExited) {
            Show-ViteStartupFailure
        }
        $code = curl.exe -s -o NUL -w "%{http_code}" "http://127.0.0.1:8080/" 2>$null
        if ($code -match "^(200|301|302)$") {
            $viteUp = $true
            break
        }
        $elapsed = [int](((Get-Date) - $viteWaitStarted).TotalSeconds)
        Write-Host "  Waiting for Vite on 8080... ${elapsed}s" -ForegroundColor DarkGray
        Start-Sleep -Seconds 2
    }
    if (-not $viteUp) {
        Write-Host "Vite did not start on 8080. See .local-dev-vite.log and .local-dev-vite.err.log" -ForegroundColor Red
        $viteErrLog = Join-Path $repoRoot ".local-dev-vite.err.log"
        if (Test-Path $viteErrLog) {
            Write-Host "--- last lines of .local-dev-vite.err.log ---" -ForegroundColor DarkYellow
            Get-Content $viteErrLog -Tail 25 | ForEach-Object { Write-Host $_ }
        }
        exit 1
    }

    Assert-ViteRepoRoot
    Assert-VitePipelineUi
} else {
    Write-Warn "Skipped Vite (-SkipDev)"
}

Start-LocalWorkerServer

Write-Step "Priming WordPress cron..."
curl.exe -k -s -o NUL "$siteUrl/wp-cron.php?doing_wp_cron"
Write-Ok "wp-cron ping sent"

Write-Host ""
Write-Ok "Local stack ready."
Write-Host "  WordPress:   $siteUrl/"
Write-Host "  WP Admin:    $siteUrl/wp-admin/"
Write-Host "  Host worker: http://localhost:10000/"
Write-Host "  React app:   $appUrl"
Write-Host "  Login:       ${appUrl}login"
Write-Host ""
Write-Host "Canonical repo only: do not run Vite from B:\Neo Pulse\Google-Ads-main."
Write-Host "First-time setup: npm run setup:local-wp"
Write-Host "Docs: docs/local-wp-staging-dev.md"

if ($OpenBrowser -and -not $SkipDev) {
    $chrome = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if ($chrome) {
        Start-Process -FilePath $chrome -ArgumentList $appUrl
    } else {
        Start-Process $appUrl
    }
}
