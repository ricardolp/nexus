#Requires -Version 5.1
<#
Deploys the whole Nexus platform to QAS on Railway
(project "nexus", environment "production" = qas.nexus.novaconsulting.com.br).

Steps (each can be skipped):
  1. git add/commit/push of the working tree       (-SkipGit)
  2. database migrations via migrate-railway.ps1    (-SkipMigrate)
  3. `railway up` for every service, from its folder (-Only svc1,svc2 to limit)

Migrations run BEFORE the new code goes out: they are additive, so the code
still running keeps working, and the new code finds its columns/tables.

Output is also written to backend\bin\deploy-qas.log (bin\ is gitignored).

Usage (from anywhere):
  powershell -ExecutionPolicy Bypass -File backend\scripts\deploy-qas.ps1
  powershell -ExecutionPolicy Bypass -File backend\scripts\deploy-qas.ps1 -SkipGit -Only frontend
#>
param(
    [switch]$SkipGit,
    [switch]$SkipMigrate,
    [string[]]$Only,
    [string]$Message = 'QAS: provedores municipais de NFS-e (IPM/Garuva), tela de credenciais e ajustes pendentes'
)

# Native tools (git, railway) write progress to stderr; with 'Stop' Windows
# PowerShell 5.1 turns that into terminating errors. Exit codes are checked.
$ErrorActionPreference = 'Continue'
$scriptsDir = $PSScriptRoot
$repo = Split-Path -Parent (Split-Path -Parent $scriptsDir)
$environment = 'production'
$projectId = '9df37c2f-2e44-4ff7-8f5f-770735cb008d'

$logDir = Join-Path $repo 'backend\bin'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'deploy-qas.log'
Start-Transcript -Path $log -Force | Out-Null

$targets = @(
    @{ Dir = 'backend';     Services = @('internal_api', 'control_plane_api', 'inbound_api', 'fiscal_worker', 'outbox_relay', 'webhook_dispatcher', 'scheduler', 'inbound_orchestrator_worker') },
    @{ Dir = 'nfe-gateway'; Services = @('nfe_gateway', 'nfe_event_worker', 'nfe_query_worker', 'nfe_protocol_worker', 'nfe_distribution_poller') },
    @{ Dir = 'frontend';    Services = @('frontend') }
)

function Invoke-Step([string]$title, [scriptblock]$body) {
    Write-Host ''
    Write-Host "=== $title ===" -ForegroundColor Cyan
    & $body
}

# `-Only a,b` via -File chega como uma string so; aceita virgulas.
if ($Only) { $Only = @($Only | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }

$failed = @()
try {
    Set-Location $repo

    if (-not $SkipGit) {
        Invoke-Step 'git commit + push' {
            git add -A
            git diff --cached --quiet
            if ($LASTEXITCODE -ne 0) {
                $msgFile = Join-Path $env:TEMP 'nexus-deploy-qas-commit.txt'
                $body = @(
                    $Message,
                    '',
                    'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>',
                    'Claude-Session: https://claude.ai/code/session_01ANimT4MY3KYZ5F6aHggfrT'
                )
                Set-Content -Path $msgFile -Value $body -Encoding UTF8
                git commit -F $msgFile
                if ($LASTEXITCODE -ne 0) { throw 'git commit failed' }
            } else {
                Write-Host 'Nothing to commit.'
            }
            git push origin main
            if ($LASTEXITCODE -ne 0) {
                Write-Host 'WARNING: git push failed - continuing with the deploy (code goes up from this folder).' -ForegroundColor Yellow
                $script:failed += 'git push'
            }
            Write-Host ("HEAD: " + (git log -1 --format='%h %s'))
        }
    }

    if (-not $SkipMigrate) {
        Invoke-Step 'migrations (Railway Postgres)' {
            & (Join-Path $scriptsDir 'migrate-railway.ps1')
            if ($LASTEXITCODE -ne 0) { throw "migrate-railway.ps1 failed (exit $LASTEXITCODE) - aborting before deploying code" }
        }
    }

    foreach ($t in $targets) {
        $dir = Join-Path $repo $t.Dir
        foreach ($svc in $t.Services) {
            if ($Only -and ($Only -notcontains $svc)) { continue }
            Invoke-Step "railway up $svc  (from $($t.Dir))" {
                Push-Location $dir
                try {
                    & railway status *> $null
                    if ($LASTEXITCODE -ne 0) {
                        Write-Host "Linking $($t.Dir) to project nexus / $environment"
                        & railway link --project $projectId --environment $environment
                    }
                    & railway up . --path-as-root --service $svc --environment $environment --detach
                    if ($LASTEXITCODE -ne 0) {
                        Write-Host "FAILED: $svc" -ForegroundColor Red
                        $script:failed += $svc
                    }
                } finally {
                    Pop-Location
                }
            }
        }
    }
}
catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    $failed += 'aborted'
}
finally {
    Write-Host ''
    if ($failed.Count -gt 0) {
        Write-Host ("DEPLOY-QAS DONE WITH PROBLEMS: " + ($failed -join ', ')) -ForegroundColor Yellow
    } else {
        Write-Host 'DEPLOY-QAS DONE: all services queued on Railway. Builds continue in the dashboard.' -ForegroundColor Green
    }
    Stop-Transcript | Out-Null
}
