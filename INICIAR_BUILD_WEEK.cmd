@echo off
title MediQuote Build Week
cd /d "%~dp0"
if not exist "node_modules\next\dist\bin\next" (
  echo Faltan dependencias. Ejecuta primero npm install.
  pause
  exit /b 1
)
node scripts\start-build-week-local.mjs
if errorlevel 1 pause
