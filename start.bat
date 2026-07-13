@echo off
echo Abriendo GASI Presupuestos...
echo El navegador se abrira en http://localhost:3000
echo.
echo Cierra esta ventana para detener la aplicacion.
echo.

start http://localhost:3000
call npx next dev -p 3000