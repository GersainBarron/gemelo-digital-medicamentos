@echo off
REM Inicia el servidor local del visor 3D (doble clic).
cd /d "%~dp0"
title CEDIS Medicamentos - Visor 3D
set PORT=8080

python -c "import http.server" >nul 2>nul && ( python serve.py %PORT% & goto :fin )
py -c "import http.server" >nul 2>nul && ( py serve.py %PORT% & goto :fin )

REM Si no hay Python instalado, usa el Python que trae Blender
for /d %%D in ("C:\Program Files\Blender Foundation\Blender*") do (
  for /d %%V in ("%%~D\*") do (
    if exist "%%~V\python\bin\python.exe" ( "%%~V\python\bin\python.exe" serve.py %PORT% & goto :fin )
  )
)
echo No se encontro Python. Instala Python desde https://www.python.org o Blender.

:fin
pause
