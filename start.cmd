@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title SKYFORGE

set "APP_URL=http://127.0.0.1:4173/?app=1"
set "APP_PROFILE=%LOCALAPPDATA%\SKYFORGE\app-profile"

REM ---- pick a local server runtime ----------------------------------------
set "NODE_EXE="
for /f "delims=" %%I in ('where node.exe 2^>nul') do (
  if not defined NODE_EXE set "NODE_EXE=%%I"
)
if not defined NODE_EXE if defined DSH_HOME (
  if exist "%DSH_HOME%\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" (
    set "NODE_EXE=%DSH_HOME%\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
  )
)
if not defined NODE_EXE (
  if exist "%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" (
    set "NODE_EXE=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
  )
)

set "PY_KIND="
if not defined NODE_EXE (
  where py.exe >nul 2>nul
  if not errorlevel 1 set "PY_KIND=py"
)
if not defined NODE_EXE if not defined PY_KIND (
  where python.exe >nul 2>nul
  if not errorlevel 1 set "PY_KIND=python"
)
if not defined NODE_EXE if not defined PY_KIND (
  powershell -NoProfile -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('SKYFORGE needs Node.js or Python to serve the game. Install Node.js from nodejs.org and run again.','SKYFORGE')" >nul 2>nul
  exit /b 1
)

REM ---- start server only if port 4173 is not already listening -------------
netstat -ano | findstr ":4173" | findstr "LISTENING" >nul
if errorlevel 1 (
  if defined NODE_EXE (
    powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath '%NODE_EXE%' -ArgumentList 'server.mjs','4173' -WorkingDirectory '%CD%' -WindowStyle Hidden" >nul 2>nul
  ) else if "%PY_KIND%"=="py" (
    powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath 'py' -ArgumentList '-3','-m','http.server','4173','--bind','127.0.0.1' -WorkingDirectory '%CD%' -WindowStyle Hidden" >nul 2>nul
  ) else (
    powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath 'python' -ArgumentList '-m','http.server','4173','--bind','127.0.0.1' -WorkingDirectory '%CD%' -WindowStyle Hidden" >nul 2>nul
  )
)

REM ---- wait for the local server ------------------------------------------
powershell -NoProfile -Command "$u='http://127.0.0.1:4173/'; for($i=0;$i -lt 40;$i++){ try { if((Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 1).StatusCode -eq 200){ exit 0 } } catch {}; Start-Sleep -Milliseconds 250 }; exit 1" >nul 2>nul
if errorlevel 1 (
  powershell -NoProfile -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('SKYFORGE local server did not start. Port 4173 may be blocked.','SKYFORGE')" >nul 2>nul
  exit /b 1
)

REM ---- pick Chrome/Edge for a chromeless app window -----------------------
set "BROWSER="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if not defined BROWSER (
  start "" "%APP_URL%"
  exit /b 0
)

if not exist "%APP_PROFILE%" mkdir "%APP_PROFILE%" >nul 2>nul

REM --app removes tabs/address bar; --start-fullscreen removes the window frame.
start "" "%BROWSER%" --app="http://127.0.0.1:4173/?app=1" --start-fullscreen --window-size=1920,1080 --window-position=0,0 --user-data-dir="%APP_PROFILE%" --no-first-run --no-default-browser-check --disable-features=TranslateUI,MemorySaverMode,HighEfficiencyMode,CalculateNativeWinOcclusion --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-session-crashed-bubble
exit /b 0
