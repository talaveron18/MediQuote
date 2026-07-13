@echo off
echo ============================================
echo  GASI Presupuestos - Resetear base de datos
echo ============================================
echo.
echo ATENCION: Esto borrara todos los datos.
echo.
set /p confirm="Escribe SI para confirmar: "
if not "%confirm%"=="SI" (
    echo Operacion cancelada.
    pause
    exit /b
)

echo [1/3] Reiniciando base de datos...
call npx prisma db push --force-reset
if %errorlevel% neq 0 (
    echo ERROR al reiniciar la base de datos.
    pause
    exit /b 1
)

echo [2/3] Regenerando Prisma Client...
call npx prisma generate

echo [3/3] Cargando datos iniciales...
call npx tsx scripts/seed.ts

echo.
echo Base de datos reseteada correctamente.
pause