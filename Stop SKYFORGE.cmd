@echo off
setlocal EnableExtensions
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":4173" ^| findstr "LISTENING"') do (
  taskkill /PID %%P /F >nul 2>nul
)
echo SKYFORGE server stopped.
timeout /t 2 /nobreak >nul
