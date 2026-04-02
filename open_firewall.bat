@echo off
chcp 65001 >nul
cd /d %~dp0

echo ================================================
echo Firewall Configuration for NPM_HTTP
echo ================================================
echo.

echo Opening Windows Defender Firewall ports...
echo.

REM HTTP port 3000
netsh advfirewall firewall add rule name="NPM_HTTP_3000" dir=in action=allow protocol=tcp localport=3000
echo [OK] Port 3000 (HTTP) opened



echo.
echo Firewall configuration complete!
echo.
echo Access URLs:
echo   HTTP:  http://localhost:3000
echo.
echo LAN Access:
echo   HTTP:  http://0.0.0.0:3000
echo.
pause
