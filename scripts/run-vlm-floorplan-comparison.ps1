param(
  [int]$Limit = 100,
  [string]$OpenAIModel = 'gpt-5.6-sol',
  [string]$GeminiModel = 'gemini-3.1-pro-preview',
  [int]$MaxOutputTokens = 16384,
  [double]$OpenAIEstimatedCostPerRequestUsd = 0.50,
  [double]$GeminiEstimatedCostPerRequestUsd = 0.50,
  [double]$MaxEstimatedTotalCostUsd = 100.00,
  [double]$MaximumMeanCloudRequestMs = 30000,
  [int]$MaxHttpAttemptsPerProvider = 100,
  [switch]$DryRun,
  [switch]$ApproveLiveRun,
  [switch]$ConfirmFreshEnvironmentKeys
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$workspace = Split-Path -Parent $repo
$dataset = Join-Path $workspace '.datasets\cubicasa5k'
$workRoot = Join-Path $workspace '.datasets\vlm-benchmark\dev-100'
$prepared = Join-Path $workRoot 'cases.json'

if ($Limit -ne 100) {
  throw 'A comparable VLM gate requires exactly the same 100-case development set. Limit must be 100.'
}
if ($MaxOutputTokens -lt 256 -or $MaxOutputTokens -gt 32768) {
  throw 'MaxOutputTokens must be between 256 and 32768.'
}
if ($OpenAIEstimatedCostPerRequestUsd -le 0 -or $GeminiEstimatedCostPerRequestUsd -le 0) {
  throw 'Per-request operator cost estimates must be positive.'
}
if ($MaxHttpAttemptsPerProvider -lt 1 -or $MaxHttpAttemptsPerProvider -gt 100) {
  throw 'MaxHttpAttemptsPerProvider must be between 1 and 100.'
}
$estimatedTotalCost = $MaxHttpAttemptsPerProvider * ($OpenAIEstimatedCostPerRequestUsd + $GeminiEstimatedCostPerRequestUsd)
if ($estimatedTotalCost -gt $MaxEstimatedTotalCostUsd) {
  throw "Operator estimate `$$estimatedTotalCost exceeds the configured total cap `$$MaxEstimatedTotalCostUsd."
}

if (-not $DryRun) {
  if (-not $ApproveLiveRun) {
    throw 'Live API execution requires the explicit -ApproveLiveRun switch.'
  }
  if (-not $ConfirmFreshEnvironmentKeys) {
    throw 'Live API execution requires -ConfirmFreshEnvironmentKeys to attest that both environment keys were newly issued for this run.'
  }
  if ([string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)) {
    throw 'OPENAI_API_KEY is not set in this PowerShell process.'
  }
  if ([string]::IsNullOrWhiteSpace($env:GEMINI_API_KEY)) {
    throw 'GEMINI_API_KEY is not set in this PowerShell process.'
  }
}

python (Join-Path $repo 'scripts\prepare-raster2seq-benchmark.py') `
  --dataset-root $dataset `
  --split dev `
  --limit $Limit `
  --output $workRoot
if ($LASTEXITCODE -ne 0) { throw 'Failed to prepare the exact dev100 case set.' }

foreach ($provider in @('openai', 'gemini')) {
  $model = if ($provider -eq 'openai') { $OpenAIModel } else { $GeminiModel }
  $providerCost = if ($provider -eq 'openai') {
    $OpenAIEstimatedCostPerRequestUsd
  } else {
    $GeminiEstimatedCostPerRequestUsd
  }
  $providerRoot = Join-Path $workRoot $provider
  $benchmarkArgs = @(
    (Join-Path $repo 'scripts\benchmark-vlm-floorplans.py'),
    '--provider', $provider,
    '--model', $model,
    '--prepared', $prepared,
    '--output', $providerRoot,
    '--limit', "$Limit",
    '--require-case-count', '100',
    '--max-requests', '100',
    '--max-http-attempts', "$MaxHttpAttemptsPerProvider",
    '--max-output-tokens', "$MaxOutputTokens",
    '--estimated-cost-per-request-usd', "$providerCost",
    '--max-estimated-cost-usd', "$MaxEstimatedTotalCostUsd"
  )
  if ($DryRun) { $benchmarkArgs += '--dry-run' }
  & python @benchmarkArgs
  if ($LASTEXITCODE -ne 0) { throw "$provider benchmark failed." }
}

if ($DryRun) {
  Write-Host 'Dry-run completed. Network calls: 0. No prediction/evidence files were produced.'
  return
}

foreach ($provider in @('openai', 'gemini')) {
  $providerRoot = Join-Path $workRoot $provider
  python (Join-Path $repo 'scripts\evaluate-vlm-floorplans.py') `
    --provider $provider `
    --prepared $prepared `
    --predictions (Join-Path $providerRoot 'predictions') `
    --runtime (Join-Path $providerRoot 'runtime.json') `
    --baseline (Join-Path $repo 'docs\evidence\cv-stage1-openings-dev.json') `
    --output (Join-Path $repo "docs\evidence\vlm-$provider-dev100.json") `
    --maximum-mean-request-ms $MaximumMeanCloudRequestMs
  if ($LASTEXITCODE -ne 0) { throw "$provider VLM evaluation failed." }
}

python (Join-Path $repo 'scripts\summarize-vlm-comparison.py') `
  --baseline (Join-Path $repo 'docs\evidence\cv-stage1-openings-dev.json') `
  --raster2seq (Join-Path $repo 'docs\evidence\raster2seq-repair-strict-dev100.json') `
  --openai (Join-Path $repo 'docs\evidence\vlm-openai-dev100.json') `
  --gemini (Join-Path $repo 'docs\evidence\vlm-gemini-dev100.json') `
  --output (Join-Path $repo 'docs\evidence\vlm-comparison-dev100.json')
if ($LASTEXITCODE -ne 0) { throw 'VLM comparison summary failed.' }
