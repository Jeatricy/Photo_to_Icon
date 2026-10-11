@echo off
setlocal
cd /d "%~dp0icon-studio"
set "ICONLAB_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "ICONLAB_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
echo IconLab - Photo to Icon
echo Starting local server. The page will open automatically in your default browser.
echo Keep this window open while using the tool.
"%ICONLAB_NODE%" server.mjs --open
pause
