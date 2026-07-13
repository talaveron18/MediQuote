@echo off
set TIMESTAMP=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%
set BACKUP_FILE=backups\gasi-backup-%TIMESTAMP%.sqlite

echo Creando backup: %BACKUP_FILE%
if not exist backups mkdir backups
copy /Y db\custom.db "%BACKUP_FILE%"
if %errorlevel% equ 0 (
    echo Backup creado correctamente: %BACKUP_FILE%
) else (
    echo ERROR: No se pudo crear el backup.
)
pause