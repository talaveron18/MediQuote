@echo off
echo ============================================
echo  GASI Presupuestos - Instalacion
echo ============================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js no esta instalado.
    echo Descargalo de https://nodejs.org/
    pause
    exit /b 1
)

echo [1/5] Instalando dependencias...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: No se pudieron instalar las dependencias.
    pause
    exit /b 1
)

echo [2/5] Generando Prisma Client...
call npx prisma generate
if %errorlevel% neq 0 (
    echo ERROR: No se pudo generar Prisma Client.
    pause
    exit /b 1
)

echo [3/5] Creando base de datos...
call npx prisma db push
if %errorlevel% neq 0 (
    echo ERROR: No se pudo crear la base de datos.
    pause
    exit /b 1
)

echo [4/5] Cargando datos iniciales...
call npx tsx scripts/seed.ts
if %errorlevel% neq 0 (
    echo ERROR: No se pudo ejecutar el seed.
    pause
    exit /b 1
)

echo [5/5] Creando carpetas de exportacion...
if not exist exports mkdir exports
if not exist exports\presupuestos mkdir exports\presupuestos
if not exist exports\presupuestos\pdf mkdir exports\presupuestos\pdf
if not exist exports\presupuestos\json mkdir exports\presupuestos\json
if not exist exports\auditoria mkdir exports\auditoria
if not exist backups mkdir backups
if not exist remote-config mkdir remote-config

echo.
echo ============================================
echo  Instalacion completada correctamente.
echo  Ejecuta start.bat para abrir la aplicacion.
echo ============================================
pause