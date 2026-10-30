# Inicia o site local: cria o ambiente virtual (se faltar), ativa e roda o servidor.
# Uso: duplo clique em "iniciar.cmd" ou: powershell -ExecutionPolicy Bypass -File iniciar.ps1
param([switch]$SemServidor)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$venv = Join-Path $PSScriptRoot '.venv'
$python = Join-Path $venv 'Scripts\python.exe'

if (-not (Test-Path $python)) {
    Write-Host 'Criando o ambiente virtual (.venv)...' -ForegroundColor Cyan
    python -m venv $venv
}

Write-Host 'Ativando o ambiente virtual...' -ForegroundColor Cyan
& (Join-Path $venv 'Scripts\Activate.ps1')

Write-Host 'Conferindo as dependencias...' -ForegroundColor Cyan
& $python -m pip install --quiet --disable-pip-version-check -r (Join-Path $PSScriptRoot 'requirements.txt')

if ($SemServidor) {
    Write-Host "Ambiente pronto: $env:VIRTUAL_ENV" -ForegroundColor Green
    exit 0
}

Write-Host ''
Write-Host 'Servidor local: http://127.0.0.1:8000' -ForegroundColor Green
Write-Host 'Para parar: Ctrl + C' -ForegroundColor DarkGray
Write-Host ''
& $python manage.py runserver 127.0.0.1:8000
