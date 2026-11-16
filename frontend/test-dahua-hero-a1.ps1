# Dahua Hero A1 RTSP Connection Test
# Tests multiple URL variations to find the working stream

param(
    [string]$CameraIP = "192.168.0.101",
    [string]$Username = "admin",
    [string]$Password = "Calin2003",
    [string]$BackendUrl = "http://localhost:3001"
)

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "Dahua Hero A1 RTSP Connection Test" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Camera IP:  $CameraIP" -ForegroundColor Yellow
Write-Host "Username:   $Username" -ForegroundColor Yellow
Write-Host "Backend:    $BackendUrl" -ForegroundColor Yellow
Write-Host ""

# Test 1: Network connectivity
Write-Host "[TEST 1] Network Connectivity" -ForegroundColor Magenta
Write-Host "Testing connection to $CameraIP:554..." -ForegroundColor Gray

$pingResult = Test-NetConnection -ComputerName $CameraIP -Port 554 -WarningAction SilentlyContinue

if ($pingResult.TcpTestSucceeded) {
    Write-Host "✅ Camera is reachable on port 554" -ForegroundColor Green
} else {
    Write-Host "❌ Cannot reach camera on port 554" -ForegroundColor Red
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  - Check camera is powered on" -ForegroundColor Yellow
    Write-Host "  - Check IP address is correct: $CameraIP" -ForegroundColor Yellow
    Write-Host "  - Check network connectivity" -ForegroundColor Yellow
    exit
}
Write-Host ""

# Test 2: Backend health
Write-Host "[TEST 2] Backend Service" -ForegroundColor Magenta
Write-Host "Checking backend is running..." -ForegroundColor Gray

try {
    $health = Invoke-WebRequest -Uri "$BackendUrl/api/health" `
        -Method GET `
        -TimeoutSec 5 `
        -ErrorAction Stop
    
    if ($health.StatusCode -eq 200) {
        Write-Host "✅ Backend is running" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Backend is not responding" -ForegroundColor Red
    Write-Host "Start with: cd backend && npm run dev" -ForegroundColor Yellow
    exit
}
Write-Host ""

# Test 3-6: Try different RTSP URLs
$urls = @(
    @{
        name = "Main Stream (subtype=0)"
        url = "rtsp://$Username`:$Password@$CameraIP`:554/cam/realmonitor?channel=1&subtype=0"
        description = "High-quality main stream"
    },
    @{
        name = "Sub-Stream (subtype=1)"
        url = "rtsp://$Username`:$Password@$CameraIP`:554/cam/realmonitor?channel=1&subtype=1"
        description = "Lower-quality sub-stream"
    },
    @{
        name = "Profile Stream"
        url = "rtsp://$Username`:$Password@$CameraIP`:554/stream/profile1"
        description = "Profile-based stream"
    },
    @{
        name = "Old Format (no port)"
        url = "rtsp://$Username`:$Password@$CameraIP/cam/realmonitor?channel=1&subtype=0"
        description = "Legacy format - often fails"
    }
)

$workingUrls = @()

for ($i = 0; $i -lt $urls.Count; $i++) {
    $urlConfig = $urls[$i]
    $testNum = $i + 3
    
    Write-Host "[TEST $testNum] $($urlConfig.name)" -ForegroundColor Magenta
    Write-Host "Description: $($urlConfig.description)" -ForegroundColor Gray
    Write-Host "Testing URL..." -ForegroundColor Gray
    
    try {
        $testPayload = @{
            url = $urlConfig.url
            timeout = 10
        } | ConvertTo-Json
        
        $response = Invoke-WebRequest -Uri "$BackendUrl/api/cameras/test-rtsp" `
            -Method POST `
            -Headers @{"Content-Type" = "application/json"} `
            -Body $testPayload `
            -TimeoutSec 20 `
            -ErrorAction Stop
        
        $result = $response.Content | ConvertFrom-Json
        
        if ($result.success) {
            Write-Host "✅ Stream is WORKING!" -ForegroundColor Green
            Write-Host "   URL: $($urlConfig.url)" -ForegroundColor Green
            $workingUrls += $urlConfig
        } else {
            Write-Host "❌ Stream failed to connect" -ForegroundColor Red
            Write-Host "   Error: $($result.error)" -ForegroundColor Red
        }
    } catch {
        Write-Host "❌ Test failed: $_" -ForegroundColor Red
    }
    
    Write-Host ""
}

# Summary
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

if ($workingUrls.Count -gt 0) {
    Write-Host "✅ FOUND $($workingUrls.Count) WORKING STREAM(S)" -ForegroundColor Green
    Write-Host ""
    
    for ($i = 0; $i -lt $workingUrls.Count; $i++) {
        $config = $workingUrls[$i]
        Write-Host "Option #$($i + 1): $($config.name)" -ForegroundColor Green
        Write-Host "URL:" -ForegroundColor Yellow
        Write-Host "  $($config.url)" -ForegroundColor White
        Write-Host "Description: $($config.description)" -ForegroundColor Gray
        Write-Host ""
    }
    
    Write-Host "RECOMMENDED NEXT STEPS:" -ForegroundColor Cyan
    Write-Host "1. Copy the first working URL above" -ForegroundColor White
    Write-Host "2. Run this PowerShell command to add camera:" -ForegroundColor White
    Write-Host ""
    
    $bestUrl = $workingUrls[0].url
    Write-Host "`$camera = @{" -ForegroundColor Gray
    Write-Host "    name = 'Dahua Hero A1'" -ForegroundColor Gray
    Write-Host "    location = 'Factory'" -ForegroundColor Gray
    Write-Host "    stream_url = '$bestUrl'" -ForegroundColor Gray
    Write-Host "    mode = 'rtsp'" -ForegroundColor Gray
    Write-Host "    notes = 'Hero A1 - Working Stream'" -ForegroundColor Gray
    Write-Host "} | ConvertTo-Json" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Invoke-WebRequest -Uri 'http://localhost:3001/api/cameras' ``" -ForegroundColor Gray
    Write-Host "  -Method POST ``" -ForegroundColor Gray
    Write-Host "  -Headers @{'Content-Type'='application/json'} ``" -ForegroundColor Gray
    Write-Host "  -Body `$camera" -ForegroundColor Gray
    Write-Host ""
    
} else {
    Write-Host "❌ No working streams found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting checklist:" -ForegroundColor Yellow
    Write-Host "☐ Camera IP is pingable (Test 1)" -ForegroundColor Yellow
    Write-Host "☐ Backend is running (Test 2)" -ForegroundColor Yellow
    Write-Host "☐ Camera credentials are correct" -ForegroundColor Yellow
    Write-Host "☐ RTSP is enabled on camera" -ForegroundColor Yellow
    Write-Host "☐ Check camera web interface: http://$CameraIP`:8080 or `:8000`" -ForegroundColor Yellow
    Write-Host "☐ Try different channel numbers (channel=1,2,3,4)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "Documentation: ./DAHUA_HERO_A1_SETUP.md" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""
