# RTSP Connection Test Script for Windows
# Usage: .\test-rtsp.ps1

param(
    [string]$RtspUrl = "rtsp://admin:Calin2003@192.168.0.101/cam/realmonitor?channel=1&subtype=1",
    [string]$BackendUrl = "http://localhost:3001",
    [int]$Timeout = 10
)

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "RTSP Connection Test Script" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Mask the password in display
$safeUrl = $RtspUrl -replace '([^:]+:[^@]+)@', '****:****@'

Write-Host "Camera URL (masked): $safeUrl" -ForegroundColor Yellow
Write-Host "Backend URL:        $BackendUrl" -ForegroundColor Yellow
Write-Host "Test Timeout:       ${Timeout}s" -ForegroundColor Yellow
Write-Host ""

# Test 1: Network connectivity to camera
Write-Host "[TEST 1] Network Connectivity" -ForegroundColor Magenta
Write-Host "Testing connection to camera IP..." -ForegroundColor Gray

$cameraIp = "192.168.0.101"  # Extract from your URL
$pingResult = Test-NetConnection -ComputerName $cameraIp -Port 554 -WarningAction SilentlyContinue

if ($pingResult.TcpTestSucceeded) {
    Write-Host "✅ Camera IP is reachable on port 554 (RTSP)" -ForegroundColor Green
} else {
    Write-Host "❌ Cannot reach camera IP:port 554" -ForegroundColor Red
    Write-Host "   - Check camera IP address is correct" -ForegroundColor Yellow
    Write-Host "   - Check firewall settings" -ForegroundColor Yellow
    Write-Host "   - Check camera is powered on and on the network" -ForegroundColor Yellow
}
Write-Host ""

# Test 2: Backend API test endpoint
Write-Host "[TEST 2] Backend RTSP Test Endpoint" -ForegroundColor Magenta
Write-Host "Sending test request to backend..." -ForegroundColor Gray

try {
    $testPayload = @{
        url = $RtspUrl
        timeout = $Timeout
    } | ConvertTo-Json

    $response = Invoke-WebRequest -Uri "$BackendUrl/api/cameras/test-rtsp" `
        -Method POST `
        -Headers @{"Content-Type" = "application/json"} `
        -Body $testPayload `
        -ErrorAction Stop `
        -TimeoutSec 20

    $result = $response.Content | ConvertFrom-Json

    if ($result.success) {
        Write-Host "✅ RTSP connection successful!" -ForegroundColor Green
        Write-Host "   Backend can connect to your camera via RTSP" -ForegroundColor Green
    } else {
        Write-Host "❌ RTSP connection failed" -ForegroundColor Red
        Write-Host "   Error: $($result.error)" -ForegroundColor Red

        if ($result.troubleshooting) {
            Write-Host ""
            Write-Host "Troubleshooting suggestions:" -ForegroundColor Yellow
            $result.troubleshooting | ForEach-Object { Write-Host "   $_" -ForegroundColor Yellow }
        }
    }
} catch {
    Write-Host "❌ Backend test failed: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Possible issues:" -ForegroundColor Yellow
    Write-Host "   - Backend server is not running (start with: npm run dev)" -ForegroundColor Yellow
    Write-Host "   - Backend URL is incorrect" -ForegroundColor Yellow
    Write-Host "   - Network issue connecting to port 3001" -ForegroundColor Yellow
}
Write-Host ""

# Test 3: FFmpeg direct test (if FFmpeg is available)
Write-Host "[TEST 3] Direct FFmpeg Test" -ForegroundColor Magenta
Write-Host "Testing with FFmpeg directly..." -ForegroundColor Gray

$ffmpegExists = Get-Command ffmpeg -ErrorAction SilentlyContinue
if ($ffmpegExists) {
    try {
        Write-Host "Running: ffmpeg -rtsp_transport tcp -timeout 5000000 -i `"$safeUrl`" -t 1 -f null -" -ForegroundColor Gray
        Write-Host "(This may take 5-10 seconds...)" -ForegroundColor Gray

        $ffmpegProc = & ffmpeg -rtsp_transport tcp -timeout 5000000 -i $RtspUrl -t 1 -f null - 2>&1

        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ FFmpeg can connect to RTSP stream" -ForegroundColor Green
        } else {
            Write-Host "❌ FFmpeg connection test failed (exit code: $LASTEXITCODE)" -ForegroundColor Red
            Write-Host "   Check the FFmpeg output above for specific errors" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️  FFmpeg test error: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️  FFmpeg not found in PATH" -ForegroundColor Yellow
    Write-Host "   Install FFmpeg or add it to your PATH to use this test" -ForegroundColor Gray
}
Write-Host ""

# Test 4: Check backend connectivity
Write-Host "[TEST 4] Backend Health Check" -ForegroundColor Magenta
Write-Host "Checking if backend is running..." -ForegroundColor Gray

try {
    $healthResponse = Invoke-WebRequest -Uri "$BackendUrl/api/health" `
        -Method GET `
        -ErrorAction Stop `
        -TimeoutSec 5

    $health = $healthResponse.Content | ConvertFrom-Json
    Write-Host "✅ Backend is running and healthy" -ForegroundColor Green
    Write-Host "   Status: $($health.status)" -ForegroundColor Green
    Write-Host "   Time: $($health.timestamp)" -ForegroundColor Green
} catch {
    Write-Host "❌ Backend is not responding" -ForegroundColor Red
    Write-Host "   Make sure the backend server is running:" -ForegroundColor Yellow
    Write-Host "   cd backend && npm run dev" -ForegroundColor Yellow
}
Write-Host ""

# Summary
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. If all tests passed: Add camera to system via web UI" -ForegroundColor Yellow
Write-Host "2. If network test failed: Check camera IP and firewall" -ForegroundColor Yellow
Write-Host "3. If backend test failed: Restart backend server" -ForegroundColor Yellow
Write-Host "4. If FFmpeg failed: Try with transport=udp or check camera settings" -ForegroundColor Yellow
Write-Host ""
Write-Host "Document: ./RTSP_CAMERA_SETUP.md" -ForegroundColor Cyan
Write-Host ""
