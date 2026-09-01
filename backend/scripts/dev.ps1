#Requires -Version 5.1
<#
.SYNOPSIS
  Sobe a stack local do fiscal-messaging no Windows (Docker + migrate + APIs/workers).

.EXAMPLE
  .\scripts\dev.ps1
  .\scripts\dev.ps1 -SetupOnly
  .\scripts\dev.ps1 -Down
#>
[CmdletBinding()]
param(
    [switch]$SetupOnly,
    [switch]$Down,
    [switch]$SkipMigrate,
    [switch]$ApiOnly
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Comando '$Name' nao encontrado no PATH. Instale e tente de novo."
    }
}

function Remove-Bom([string]$Path) {
    $text = [System.IO.File]::ReadAllText($Path)
    if (-not $text.StartsWith([char]0xFEFF)) { return $false }

    [System.IO.File]::WriteAllText($Path, $text.TrimStart([char]0xFEFF), (New-Object System.Text.UTF8Encoding($false)))
    return $true
}

function Ensure-EnvFile {
    $envFile = Join-Path $Root ".env"
    $example = Join-Path $Root ".env.example"
    if (-not (Test-Path $envFile)) {
        if (-not (Test-Path $example)) {
            throw "Arquivo .env.example nao encontrado."
        }
        Copy-Item $example $envFile
        Write-Host "Criado .env a partir de .env.example"
    }

    # godotenv aborta o arquivo inteiro se a primeira chave vier com BOM,
    # e config.Load() descarta esse erro -- resultado: nenhuma env carregada.
    if (Remove-Bom $envFile) {
        Write-Host "Removido BOM UTF-8 do .env"
    }

    $missing = @("DATABASE_URL", "JWT_SECRET") | Where-Object {
        -not (Select-String -Path $envFile -Pattern "^\s*$_\s*=\s*\S" -Quiet)
    }
    if ($missing) {
        throw "Variaveis obrigatorias ausentes no .env: $($missing -join ', ')"
    }
}

function Wait-PostgresHealthy {
    $deadline = (Get-Date).AddMinutes(2)
    do {
        $status = docker inspect -f "{{.State.Health.Status}}" fiscal_messaging_postgres 2>$null
        if ($status -eq "healthy") {
            Write-Host "Postgres healthy."
            return
        }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)

    throw "Postgres nao ficou healthy a tempo. Verifique: docker compose logs postgres"
}

function Start-ServiceWindow([string]$Name, [string]$GoPackage) {
    $title = "fiscal-messaging:$Name"
    $cmd = @"
`$Host.UI.RawUI.WindowTitle = '$title'
Set-Location '$Root'
Write-Host 'Iniciando $Name...' -ForegroundColor Green
go run ./$GoPackage
Write-Host ''
Write-Host 'Processo encerrado. Pressione Enter para fechar.' -ForegroundColor Yellow
Read-Host
"@
    Start-Process powershell -ArgumentList @("-NoExit", "-NoProfile", "-Command", $cmd) | Out-Null
    Write-Host "  aberto: $Name"
}

if ($Down) {
    Write-Step "Parando containers Docker"
    docker compose down
    Write-Host "Pronto. Feche as janelas dos servicos Go se ainda estiverem abertas."
    exit 0
}

Assert-Command "go"
Assert-Command "docker"

Write-Step "Preparando .env"
Ensure-EnvFile

Write-Step "Subindo Postgres + RabbitMQ"
docker compose up -d
Wait-PostgresHealthy

Write-Step "Instalando dependencias Go"
go mod tidy

if (-not $SkipMigrate) {
    Write-Step "Aplicando migrations"
    go run ./cmd/migrate -direction up
}

if ($SetupOnly) {
    Write-Host ""
    Write-Host "Setup concluido. Para subir os servicos:" -ForegroundColor Green
    Write-Host "  .\scripts\dev.ps1"
    exit 0
}

Write-Step "Abrindo servicos em janelas separadas"
$services = @(
    @{ Name = "control_plane_api"; Package = "cmd/control_plane_api" },
    @{ Name = "inbound_api"; Package = "cmd/inbound_api" }
)

if (-not $ApiOnly) {
    $services += @(
        @{ Name = "outbox_relay"; Package = "cmd/outbox_relay" },
        @{ Name = "fiscal_worker"; Package = "cmd/fiscal_worker" },
        @{ Name = "webhook_dispatcher"; Package = "cmd/webhook_dispatcher" },
        @{ Name = "scheduler"; Package = "cmd/scheduler" }
    )
}

foreach ($svc in $services) {
    Start-ServiceWindow -Name $svc.Name -GoPackage $svc.Package
    Start-Sleep -Milliseconds 400
}

Write-Host ""
Write-Host "Stack local no ar." -ForegroundColor Green
Write-Host "  control_plane_api  -> http://localhost:4000"
Write-Host "  inbound_api        -> http://localhost:4001"
Write-Host "  rabbitmq UI        -> http://localhost:15672 (guest/guest)"
Write-Host ""
Write-Host "Para parar a infra:  .\scripts\dev.ps1 -Down"
Write-Host "Exemplos HTTP:       scripts\api.http"
