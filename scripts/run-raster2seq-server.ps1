param(
  [switch]$RebuildImage,
  [ValidateSet('auto', 'cuda', 'cpu')]
  [string]$Device = 'auto',
  [ValidateRange(1, 65535)]
  [int]$Port = 8977
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$workspace = Split-Path -Parent $repo
$checkpoint = Join-Path $workspace '.datasets\Raster2Seq\checkpoints\cubicasa5k\checkpoint.pth'
$backboneCache = Join-Path $workspace '.datasets\Raster2Seq\weights\torch-hub\checkpoints'
$serverScript = Join-Path $repo 'scripts\raster2seq\inference_server.py'
$image = 'interior3d-raster2seq:a6c4e27'
$containerName = 'interior3d-raster2seq-server'
$expectedCheckpointSha256 = 'F7C0EF9379AA8CF11349DA8B2179214E0D495AF758383984A2361A1309AAB3B7'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker CLI was not found.'
}

docker version --format '{{.Server.Version}}' | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Docker engine is not available.'
}

if (-not (Test-Path -LiteralPath $checkpoint -PathType Leaf)) {
  throw "Raster2Seq checkpoint not found: $checkpoint"
}
if (-not (Test-Path -LiteralPath (Join-Path $backboneCache 'resnet50-0676ba61.pth') -PathType Leaf)) {
  throw "ResNet-50 backbone not found: $backboneCache"
}
if (-not (Test-Path -LiteralPath $serverScript -PathType Leaf)) {
  throw "Raster2Seq inference server not found: $serverScript"
}

$checkpointSha256 = (Get-FileHash -LiteralPath $checkpoint -Algorithm SHA256).Hash
if ($checkpointSha256 -ne $expectedCheckpointSha256) {
  throw "Raster2Seq checkpoint SHA-256 mismatch. Expected $expectedCheckpointSha256, got $checkpointSha256."
}

$imageId = docker image ls --quiet $image
$imageExists = $LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace(($imageId -join ''))
if ($RebuildImage -or -not $imageExists) {
  docker build `
    --tag $image `
    --file (Join-Path $repo 'scripts\raster2seq\Dockerfile') `
    (Join-Path $repo 'scripts\raster2seq')
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to build Docker image $image."
  }
}

function Remove-ExistingRaster2SeqContainer {
  $existing = docker container ls --all --filter "name=^${containerName}$" --format '{{.Names}}'
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to inspect existing container $containerName."
  }
  if ($existing -contains $containerName) {
    docker container rm --force $containerName | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to replace existing container $containerName."
    }
  }
}

function Start-Raster2SeqContainer {
  param([bool]$WithGpu)

  $dockerArgs = @(
    'run',
    '--detach',
    '--name', $containerName,
    '--restart', 'unless-stopped',
    '--init',
    '--security-opt', 'no-new-privileges',
    '--publish', "127.0.0.1:${Port}:8977",
    '--env', 'PYTHONDONTWRITEBYTECODE=1',
    '--env', 'PYTHONUNBUFFERED=1'
  )
  if ($WithGpu) {
    $dockerArgs += @('--gpus', 'all')
  }
  $dockerArgs += @(
    '--mount', "type=bind,source=$checkpoint,target=/checkpoints/cubicasa5k/checkpoint.pth,readonly",
    '--mount', "type=bind,source=$backboneCache,target=/root/.cache/torch/hub/checkpoints,readonly",
    '--mount', "type=bind,source=$serverScript,target=/opt/raster2seq/inference_server.py,readonly",
    '--entrypoint', 'python3.10',
    $image,
    '/opt/raster2seq/inference_server.py',
    '--host', '0.0.0.0',
    '--port', '8977',
    '--checkpoint', '/checkpoints/cubicasa5k/checkpoint.pth',
    '--device', $Device
  )

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = & docker @dockerArgs 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  return [PSCustomObject]@{
    ExitCode = $exitCode
    Output = ($output -join [Environment]::NewLine)
  }
}

Remove-ExistingRaster2SeqContainer

$gpuDetected = $false
if ($Device -ne 'cpu') {
  $nvidiaSmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
  if ($nvidiaSmi) {
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $nvidiaSmi.Source --query-gpu=name --format=csv,noheader 2>$null | Out-Null
    $gpuDetected = $LASTEXITCODE -eq 0
    $ErrorActionPreference = $previousErrorActionPreference
  }
}

$start = Start-Raster2SeqContainer -WithGpu:$gpuDetected
if ($start.ExitCode -ne 0 -and $gpuDetected) {
  # Docker Desktop can expose nvidia-smi on the host while its GPU runtime is
  # unavailable.  Relaunch without --gpus so /health can report the pinned
  # model's explicit CPU-operator limitation instead of losing the service.
  Remove-ExistingRaster2SeqContainer
  $start = Start-Raster2SeqContainer -WithGpu:$false
}
if ($start.ExitCode -ne 0) {
  throw "Failed to start Raster2Seq sidecar: $($start.Output)"
}

Add-Type -AssemblyName System.Net.Http
$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [TimeSpan]::FromSeconds(2)
$healthUrl = "http://127.0.0.1:${Port}/health"
$healthBody = $null
$healthReady = $false
try {
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
      $response = $client.GetAsync($healthUrl).Result
      $healthBody = $response.Content.ReadAsStringAsync().Result
      if ($response.IsSuccessStatusCode -and $healthBody) {
        try {
          $health = $healthBody | ConvertFrom-Json
          if ($health.ready -eq $true) {
            $healthReady = $true
            break
          }
        } catch {
          $healthReady = $false
        }
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }
} finally {
  $client.Dispose()
}

if (-not $healthReady) {
  $logs = docker logs --tail 40 $containerName 2>&1
  throw "Raster2Seq sidecar did not expose /health within 60 seconds.`n$($logs -join [Environment]::NewLine)"
}

Write-Output $healthBody
Write-Output "Raster2Seq sidecar: $healthUrl"
