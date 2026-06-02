Set-Location $PSScriptRoot

Write-Host "Pulling latest changes from git..."
git pull
if (-not $?) {
    Write-Host "git pull failed. Aborting."
    exit 1
}

Write-Host "Starting server..."
& "$PSScriptRoot\.venv\Scripts\python.exe" "$PSScriptRoot\AI\server.py"
