#Requires -Version 5.1
<#
.SYNOPSIS
  Converte um certificado A1 (.pfx/.p12) para um formato que o Nexus consegue importar.

.DESCRIPTION
  Alguns PFX exportados pelo Windows ou pela AC falham no upload do Nexus.
  Este script gera um novo .pfx (compativel) a partir do original + senha.

  Preferencia:
    1) OpenSSL (melhor compatibilidade com o backend)
    2) .NET / Windows (fallback se OpenSSL nao estiver instalado)

.EXAMPLE
  .\normalize-a1-pfx.ps1 -In "C:\certs\empresa.pfx"

.EXAMPLE
  .\normalize-a1-pfx.ps1 -In ".\empresa.pfx" -Out ".\empresa-nexus.pfx" -Password "minha-senha"
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$In,

  [string]$Out,

  [string]$Password,

  [string]$NewPassword
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-OpenSsl {
  $cmd = Get-Command openssl -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = @(
    "${env:ProgramFiles}\OpenSSL-Win64\bin\openssl.exe",
    "${env:ProgramFiles}\OpenSSL\bin\openssl.exe",
    "${env:ProgramFiles(x86)}\OpenSSL-Win32\bin\openssl.exe",
    "${env:LOCALAPPDATA}\Programs\OpenSSL\bin\openssl.exe"
  )
  foreach ($path in $candidates) {
    if (Test-Path -LiteralPath $path) { return $path }
  }
  return $null
}

function Read-PasswordPlain([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

if (-not (Test-Path -LiteralPath $In)) {
  throw "Arquivo nao encontrado: $In"
}

$In = (Resolve-Path -LiteralPath $In).Path
if (-not $Out) {
  $dir = Split-Path -Parent $In
  $base = [IO.Path]::GetFileNameWithoutExtension($In)
  $Out = Join-Path $dir ($base + "-nexus.pfx")
}
else {
  $outDir = Split-Path -Parent $Out
  if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  }
}

if (-not $Password) {
  $Password = Read-PasswordPlain "Senha do certificado original"
}
if (-not $NewPassword) {
  $NewPassword = $Password
}

$tempDir = Join-Path ([IO.Path]::GetTempPath()) ("nexus-pfx-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempDir | Out-Null

try {
  $openssl = Resolve-OpenSsl
  if ($openssl) {
    Write-Host "Usando OpenSSL: $openssl"
    $pem = Join-Path $tempDir "material.pem"
    $passIn = Join-Path $tempDir "pass-in.txt"
    $passOut = Join-Path $tempDir "pass-out.txt"
    # Sem newline - OpenSSL "file:" inclui o conteudo literal.
    [IO.File]::WriteAllBytes($passIn, [Text.Encoding]::UTF8.GetBytes($Password))
    [IO.File]::WriteAllBytes($passOut, [Text.Encoding]::UTF8.GetBytes($NewPassword))

    $extractOk = $false
    foreach ($legacy in @($true, $false)) {
      $opensslArgs = @(
        "pkcs12", "-in", $In, "-out", $pem, "-nodes",
        "-passin", "file:$passIn"
      )
      if ($legacy) { $opensslArgs += "-legacy" }
      & $openssl @opensslArgs 2>$null
      if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $pem)) {
        $extractOk = $true
        break
      }
      Remove-Item -LiteralPath $pem -ErrorAction SilentlyContinue
    }
    if (-not $extractOk) {
      throw "OpenSSL nao conseguiu abrir o PFX. Confira a senha."
    }

    # Exporta em 3DES/SHA1 (formato legado que o go-pkcs12 do Nexus le bem).
    $exportArgs = @(
      "pkcs12", "-export",
      "-in", $pem,
      "-out", $Out,
      "-passin", "file:$passOut",
      "-passout", "file:$passOut",
      "-certpbe", "PBE-SHA1-3DES",
      "-keypbe", "PBE-SHA1-3DES",
      "-macalg", "SHA1"
    )
    & $openssl @exportArgs
    if ($LASTEXITCODE -ne 0) {
      # OpenSSL 3 sem provider legacy: tenta -legacy no export.
      $exportArgs += "-legacy"
      & $openssl @exportArgs
      if ($LASTEXITCODE -ne 0) {
        throw "OpenSSL falhou ao gerar o PFX de saida."
      }
    }
  }
  else {
    Write-Host "OpenSSL nao encontrado - usando exportacao .NET/Windows."
    Write-Host "Dica: para melhor compatibilidade, instale OpenSSL e rode de novo:"
    Write-Host "  winget install ShiningLight.OpenSSL.Light"
    Write-Host ""

    Add-Type -AssemblyName System.Security
    $flags = [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable -bor
             [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet

    $collection = New-Object Security.Cryptography.X509Certificates.X509Certificate2Collection
    try {
      $collection.Import($In, $Password, $flags)
    }
    catch {
      # EphemeralKeySet nao existe em todos os runtimes - tenta sem.
      $flags = [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
      $collection = New-Object Security.Cryptography.X509Certificates.X509Certificate2Collection
      $collection.Import($In, $Password, $flags)
    }

    $leaf = $collection | Where-Object { $_.HasPrivateKey } | Select-Object -First 1
    if (-not $leaf) {
      throw "Nenhum certificado com chave privada encontrado no PFX."
    }

    $bytes = $leaf.Export(
      [Security.Cryptography.X509Certificates.X509ContentType]::Pkcs12,
      $NewPassword
    )
    [IO.File]::WriteAllBytes($Out, $bytes)

    foreach ($c in $collection) {
      $c.Dispose()
    }
  }

  if (-not (Test-Path -LiteralPath $Out) -or ((Get-Item -LiteralPath $Out).Length -lt 100)) {
    throw "Arquivo de saida invalido ou vazio: $Out"
  }

  # Mostra metadados do resultado (so leitura).
  try {
    $check = New-Object Security.Cryptography.X509Certificates.X509Certificate2($Out, $NewPassword)
    Write-Host ""
    Write-Host "OK - arquivo gerado:"
    Write-Host "  $Out"
    Write-Host "  Subject : $($check.Subject)"
    Write-Host "  Issuer  : $($check.Issuer)"
    Write-Host "  Valido  : $($check.NotBefore) -> $($check.NotAfter)"
    Write-Host "  Senha   : a mesma informada (ou -NewPassword, se usou)"
    Write-Host ""
    Write-Host "Envie este arquivo no Nexus (Certificado da empresa)."
    $check.Dispose()
  }
  catch {
    Write-Host ""
    Write-Host "OK - arquivo gerado: $Out"
    Write-Host "(nao foi possivel ler metadados; o arquivo mesmo assim foi escrito)"
  }
}
finally {
  if (Test-Path -LiteralPath $tempDir) {
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
