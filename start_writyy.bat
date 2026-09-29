@echo off
title Writyy - IELTS Auditory Trainer
cd /d "%~dp0"
echo ========================================================
echo   Starting Writyy (IELTS Vocabulary & Spelling Trainer)
echo ========================================================
echo.
start http://localhost:5173
npm run dev -- --host
pause
