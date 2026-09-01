#Requires -Version 5.1
<#
Opens a tunnel to the Railway "Postgres" service (production environment),
waits for it to come up, runs `go run ./cmd/migrate -direction up` against
it, then tears the tunnel down. Safe to re-run — migrate skips anything
already applied.

Run from anywhere; it cd's into the backend repo itself.
#>

$backendDir = Split-Path -Parent $PSScriptRoot
Set-Location $backendDir

# Kills a process AND its descendants. Needed because the tunnel is launched
# via cmd.exe (see below) -- killing just that PID would leave the actual
# `railway` process (and the SSH tunnel under it) running as an orphan.
function Stop-ProcessTree {
    param([int]$ProcessId)
    & taskkill /PID $ProcessId /T /F 2>&1 | Out-Null
}

# 1. Make sure an SSH key exists — railway connect --ssh needs one.
$sshDir = Join-Path $HOME '.ssh'
$hasKey = (Test-Path (Join-Path $sshDir 'id_ed25519')) -or (Test-Path (Join-Path $sshDir 'id_rsa'))
if (-not $hasKey) {
    Write-Host 'No SSH key found — generating one (ed25519, no passphrase)...'
    if (-not (Test-Path $sshDir)) { New-Item -ItemType Directory -Path $sshDir | Out-Null }
    # A truly empty PowerShell string ('') is dropped before it reaches the
    # native exe, shifting every arg after it. '""' (the literal two-quote
    # token) is what Win32 argv parsing turns into an empty value.
    & ssh-keygen -t ed25519 -N '""' -f (Join-Path $sshDir 'id_ed25519') -q
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ssh-keygen failed. Generate a key manually (ssh-keygen -t ed25519) and re-run this script." -ForegroundColor Red
        exit 1
    }
}

# 2. Start the tunnel in the background, capturing its output to temp files.
#    stdout/stderr must be separate files -- Start-Process rejects the same
#    path for both.
$tunnelOut = Join-Path $env:TEMP 'railway-pg-tunnel.out.log'
$tunnelErr = Join-Path $env:TEMP 'railway-pg-tunnel.err.log'
$tunnelIn = Join-Path $env:TEMP 'railway-pg-tunnel.in.txt'
Remove-Item $tunnelOut, $tunnelErr, $tunnelIn -ErrorAction SilentlyContinue

# In case the SSH key isn't registered with Railway yet, it may ask to
# confirm ("Register this SSH key with Railway? (Y/n)"). Feed it a "y"
# answer so it doesn't hang waiting on a console that isn't attached.
Set-Content -Path $tunnelIn -Value ("y`n" * 5) -NoNewline

Write-Host 'Opening tunnel to Railway Postgres (production)...'
# `railway` resolves via PATH to railway.exe, but Start-Process's direct
# CreateProcess-based launch has been unreliable finding it on this machine
# ("not a valid Win32 application"). Route it through cmd.exe, which does
# its own PATH/PATHEXT resolution.
$tunnelProc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c', 'railway', 'connect', 'Postgres', '--environment', 'production', '--tunnel-only', '--port', '15432' `
    -RedirectStandardInput $tunnelIn `
    -RedirectStandardOutput $tunnelOut `
    -RedirectStandardError $tunnelErr `
    -PassThru -NoNewWindow

function Get-TunnelLog {
    $out = if (Test-Path $tunnelOut) { Get-Content $tunnelOut -Raw -ErrorAction SilentlyContinue } else { '' }
    $err = if (Test-Path $tunnelErr) { Get-Content $tunnelErr -Raw -ErrorAction SilentlyContinue } else { '' }
    # Strip ANSI escape codes (color output) before regex matching.
    # [char]27 (ESC) is used explicitly since `e is not recognized in
    # Windows PowerShell 5.1 (only PowerShell 7+).
    $esc = [char]27
    ("$out`n$err") -replace "$esc\[[0-9;]*[a-zA-Z]", ''
}

# Everything from here on must guarantee the tunnel process gets killed,
# whatever happens (timeout, migrate failure, Ctrl+C) -- hence the single
# try/finally wrapping the rest of the script instead of scattered
# kill-then-exit calls, which is what left orphaned processes behind before.
$exitCode = 0
try {
    # 3. Poll the log for a connection string (postgresql://...@127.0.0.1:15432/...).
    $connString = $null
    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 1
        $content = Get-TunnelLog
        $match = [regex]::Match($content, 'postgres(?:ql)?://[^\s"]+(?:localhost|127\.0\.0\.1):15432[^\s"]*')
        if ($match.Success) {
            $connString = $match.Value
            break
        }
        if ($tunnelProc.HasExited) {
            Write-Host "Tunnel process exited early. Log:`n$(Get-TunnelLog)" -ForegroundColor Red
            $exitCode = 1
            return
        }
    }

    if (-not $connString) {
        Write-Host "Timed out waiting for tunnel connection string. Log:`n$(Get-TunnelLog)" -ForegroundColor Red
        $exitCode = 1
        return
    }

    Write-Host "Tunnel up. Running migrations..."

    # 4. Run migrate against the tunnel.
    $env:DATABASE_URL = $connString
    try {
        & go run ./cmd/migrate -direction up
        $exitCode = $LASTEXITCODE
    } finally {
        Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
    }

    if ($exitCode -ne 0) {
        Write-Host "migrate exited with code $exitCode" -ForegroundColor Red
    } else {
        Write-Host "`nMigration complete." -ForegroundColor Green
    }
} finally {
    # 5. Always tear down the tunnel, no matter which path got us here.
    Stop-ProcessTree -ProcessId $tunnelProc.Id
}

exit $exitCode
