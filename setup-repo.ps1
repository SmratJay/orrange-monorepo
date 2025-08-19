# GitHub Repository Setup Script
# This script will help set up your GitHub repository

Write-Host "=== GitHub Repository Setup ===" -ForegroundColor Green

# Navigate to project directory
Set-Location "d:\orrange-v1\orrange-monorepo"

Write-Host "Current directory: $(Get-Location)" -ForegroundColor Yellow

# Check git status
Write-Host "`n1. Checking git status..." -ForegroundColor Cyan
git status

# Check if we have any remotes
Write-Host "`n2. Checking git remotes..." -ForegroundColor Cyan
git remote -v

# Add GitHub remote if it doesn't exist
Write-Host "`n3. Adding GitHub remote..." -ForegroundColor Cyan
try {
    git remote add origin https://github.com/SmratJay/orrange-p2p-platform.git
    Write-Host "Remote added successfully!" -ForegroundColor Green
} catch {
    Write-Host "Remote may already exist, trying to set URL..." -ForegroundColor Yellow
    git remote set-url origin https://github.com/SmratJay/orrange-p2p-platform.git
}

# Verify remote was added
Write-Host "`n4. Verifying remote..." -ForegroundColor Cyan
git remote -v

# Ensure we're on main branch
Write-Host "`n5. Setting up main branch..." -ForegroundColor Cyan
git branch -M main

# Show what we're about to push
Write-Host "`n6. Files to be pushed:" -ForegroundColor Cyan
git ls-files

Write-Host "`n=== Setup Complete! ===" -ForegroundColor Green
Write-Host "Next step: Run 'git push -u origin main' to push to GitHub" -ForegroundColor Yellow
Write-Host "Repository URL: https://github.com/SmratJay/orrange-p2p-platform" -ForegroundColor Yellow
