@echo off
echo === GitHub Setup for Orrange P2P Platform ===
echo.

REM Navigate to project directory
cd /d "d:\orrange-v1\orrange-monorepo"
echo Current directory: %cd%
echo.

echo Step 1: Authenticating with GitHub...
gh auth login --web --git-protocol https --hostname github.com

echo.
echo Step 2: Creating repository...
gh repo create orrange-p2p-platform --public --description "Next-generation P2P trading platform with military-grade escrow and enhanced authentication"

echo.
echo Step 3: Adding remote...
git remote add origin https://github.com/SmratJay/orrange-p2p-platform.git

echo.
echo Step 4: Setting main branch...
git branch -M main

echo.
echo Step 5: Pushing to GitHub...
git push -u origin main

echo.
echo === Setup Complete! ===
echo Repository URL: https://github.com/SmratJay/orrange-p2p-platform
echo.
pause
