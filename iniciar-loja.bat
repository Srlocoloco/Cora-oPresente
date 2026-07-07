@echo off
title Coracao Presente - Inicializacao
echo ============================================
echo   Iniciando a loja Coracao Presente...
echo ============================================
echo.

REM ── 1) MySQL do XAMPP ─────────────────────────────────────────────
REM Se o XAMPP estiver instalado em outra pasta, ajuste a linha abaixo.
set XAMPP=C:\xampp

tasklist /FI "IMAGENAME eq mysqld.exe" | find /I "mysqld.exe" >nul
if errorlevel 1 (
  echo [1/3] Iniciando o MySQL do XAMPP...
  start "MySQL - XAMPP" /MIN cmd /c "%XAMPP%\mysql_start.bat"
  timeout /t 5 /nobreak >nul
) else (
  echo [1/3] MySQL ja esta rodando.
)

REM ── 2) Backend (banco de dados + PIX) ─────────────────────────────
REM Se a porta 3333 ja estiver em uso, o backend ja esta ligado.
netstat -ano | findstr /R /C:":3333 .*LISTENING" >nul
if errorlevel 1 (
  echo [2/3] Iniciando o backend...
  start "Backend - Coracao Presente" cmd /k "cd /d "%~dp0backend" && npm start"
) else (
  echo [2/3] Backend ja esta rodando.
)

REM ── 3) Site ───────────────────────────────────────────────────────
REM Se a porta 5173 ja estiver em uso, o site ja esta ligado.
netstat -ano | findstr /R /C:":5173 .*LISTENING" >nul
if errorlevel 1 (
  echo [3/3] Iniciando o site...
  start "Site - Coracao Presente" cmd /k "cd /d "%~dp0" && npm run dev"
) else (
  echo [3/3] Site ja esta rodando.
)

REM Aguarda tudo subir e abre o navegador
timeout /t 6 /nobreak >nul
start http://localhost:5173

echo.
echo Tudo pronto! As janelas do backend e do site precisam ficar abertas.
echo Para desligar, e so fechar as janelas.
timeout /t 8 >nul
exit
