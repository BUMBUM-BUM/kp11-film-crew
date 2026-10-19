@echo off
chcp 65001 > nul
title Медиацентр КП11 - Демонстрационный стенд (Порт 3001)
powershell -ExecutionPolicy Bypass -File "%~dp0launch_demo.ps1"
pause
