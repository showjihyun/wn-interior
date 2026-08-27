param(
  [switch]$RebuildImage,
  [switch]$UseExistingDevEvidence,
  [switch]$ForceHoldout
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$workspace = Split-Path -Parent $repo
$dataset = Join-Path $workspace '.datasets\cubicasa5k'
$checkpoint = Join-Path $workspace '.datasets\Raster2Seq\checkpoints\cubicasa5k\checkpoint.pth'
$backboneCache = Join-Path $workspace '.datasets\Raster2Seq\weights\torch-hub\checkpoints'
$workRoot = Join-Path $workspace '.datasets\raster2seq-benchmark'
$image = 'interior3d-raster2seq:a6c4e27'
$commit = 'a6c4e27a68d11d7a459f6e4a2601fd887227dd1a'
$runner = Join-Path $repo 'scripts\raster2seq\container-run.sh'
$cudaHook = Join-Path $repo 'scripts\raster2seq\sitecustomize.py'

if (-not (Test-Path -LiteralPath $checkpoint)) {
  throw "Raster2Seq checkpoint not found: $checkpoint"
}
if (-not (Test-Path -LiteralPath (Join-Path $backboneCache 'resnet50-0676ba61.pth'))) {
  throw "ResNet-50 backbone not found: $backboneCache"
}

$imageExists = docker image inspect $image 2>$null
if ($RebuildImage -or -not $imageExists) {
  docker build --tag $image --file (Join-Path $repo 'scripts\raster2seq\Dockerfile') (Join-Path $repo 'scripts\raster2seq')
}

function Invoke-Raster2SeqSplit {
  param(
    [string]$Split,
    [string]$Baseline,
    [string]$Evidence
  )
  $splitRoot = Join-Path $workRoot $Split
  $inputDir = Join-Path $splitRoot 'input'
  $outputDir = Join-Path $splitRoot 'output'
  New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

  python (Join-Path $repo 'scripts\prepare-raster2seq-benchmark.py') `
    --dataset-root $dataset `
    --split $Split `
    --output $splitRoot

  docker run --rm --gpus all `
    --mount "type=bind,source=$inputDir,target=/input,readonly" `
    --mount "type=bind,source=$outputDir,target=/output" `
    --mount "type=bind,source=$checkpoint,target=/checkpoints/cubicasa5k/checkpoint.pth,readonly" `
    --mount "type=bind,source=$backboneCache,target=/root/.cache/torch/hub/checkpoints,readonly" `
    --mount "type=bind,source=$runner,target=/runner/container-run.sh,readonly" `
    --mount "type=bind,source=$cudaHook,target=/runner/sitecustomize.py,readonly" `
    --entrypoint bash `
    $image /runner/container-run.sh

  python (Join-Path $repo 'scripts\evaluate-raster2seq.py') `
    --prepared (Join-Path $splitRoot 'cases.json') `
    --predictions (Join-Path $outputDir 'cubicasa5k\jsons') `
    --runtime (Join-Path $outputDir 'runtime.json') `
    --hardware-runtime (Join-Path $outputDir 'runtime.json') `
    --baseline (Join-Path $repo $Baseline) `
    --output (Join-Path $repo $Evidence) `
    --raster2seq-commit $commit `
    --repair-geometry `
    --safe-fallback
}

$devEvidence = 'docs\evidence\raster2seq-repair-strict-dev100.json'
if (-not $UseExistingDevEvidence) {
  Invoke-Raster2SeqSplit `
    -Split 'dev' `
    -Baseline 'docs\evidence\cv-stage1-openings-dev.json' `
    -Evidence $devEvidence
} elseif (-not (Test-Path -LiteralPath (Join-Path $repo $devEvidence))) {
  throw "Existing development evidence not found: $devEvidence"
}

$devResult = Get-Content (Join-Path $repo $devEvidence) -Raw | ConvertFrom-Json
if ($devResult.gatePassed) {
  $holdoutEvidence = Join-Path $repo 'docs\evidence\raster2seq-repair-strict-holdout900.json'
  if ((Test-Path -LiteralPath $holdoutEvidence) -and -not $ForceHoldout) {
    Write-Host 'Holdout evidence already exists; the 900-case split was not rerun.'
  } else {
    Invoke-Raster2SeqSplit `
      -Split 'holdout' `
      -Baseline 'docs\evidence\cv-stage1-openings-holdout-after.json' `
      -Evidence 'docs\evidence\raster2seq-repair-strict-holdout900.json'
  }
} else {
  Write-Host 'Development gate failed; holdout 900 was intentionally not executed.'
}
