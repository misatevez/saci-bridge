@echo off
REM Start SaciERP Mock API on Windows

setlocal enabledelayedexpansion
set PORT=9100

echo [INFO] Starting SaciERP Mock API on port %PORT%...
echo [INFO] Navigate to http://localhost:%PORT%/health to verify

npm start

pause
