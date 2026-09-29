@echo off
echo ========================================================
echo   Pushing Writyy to GitHub for automatic Render deploy
echo ========================================================
git add .
git commit -m "Update Writyy app"
git push -u origin main
echo.
echo ========================================================
echo   Done! Render is now automatically building & deploying
echo ========================================================
pause
