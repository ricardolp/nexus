@echo off
rem Double-click: deploy completo do Nexus para o QAS (Railway). Ver deploy-qas.ps1.
cd /d "%~dp0..\.."
powershell -NoProfile -ExecutionPolicy Bypass -NoExit -File "%~dp0deploy-qas.ps1" %*
