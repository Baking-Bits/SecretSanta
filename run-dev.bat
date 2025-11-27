@echo off
setlocal
cd /d %~dp0

REM Kill Node processes to avoid port conflicts
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :3000') do taskkill /F /PID %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :5173') do taskkill /F /PID %%p >nul 2>&1

call npm run dev
endlocal
