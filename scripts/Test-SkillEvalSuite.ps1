# Skill evaluation suite structural validator (PowerShell 5.1)
# Usage from repo root: powershell -NoProfile -File scripts\Test-SkillEvalSuite.ps1

$ErrorActionPreference = 'Stop'

function Write-Fail {
    param([string]$Reason)
    Write-Output "FAIL: $Reason"
    exit 1
}

function Get-RepoRoot {
    if (-not $PSScriptRoot) {
        Write-Fail 'cannot resolve script root (PSScriptRoot is empty)'
    }
    return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function Get-NormalizedCaseSha256Hex {
    param([string]$FilePath)
    # UTF-8 text → CRLF/CR を LF に正規化 → UTF-8 bytes の SHA-256（checkout 改行形式に依存しない）
    $utf8 = New-Object System.Text.UTF8Encoding $false
    $text = [System.IO.File]::ReadAllText($FilePath, $utf8)
    $normalized = $text.Replace("`r`n", "`n").Replace("`r", "`n")
    $bytes = $utf8.GetBytes($normalized)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return (-join ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }))
    }
    finally {
        $sha.Dispose()
    }
}

function Test-Sha256HexFormat {
    param([string]$Value)
    return ($Value -match '^[a-f0-9]{64}$')
}

$root = Get-RepoRoot

$conventionPath = Join-Path $root 'docs\harness\skill-eval\suite-convention.md'
$casePath = Join-Path $root 'docs\harness\skill-eval\cases\route-pm-model-pilot.md'
$oraclePath = Join-Path $root 'docs\harness\skill-eval\oracles\route-pm-model-pilot.md'
$recordPath = Join-Path $root 'docs\harness\skill-eval\records\route-pm-model-pilot.md'
$validatorPath = Join-Path $root 'scripts\Test-SkillEvalSuite.ps1'

$requiredPaths = @(
    @{ Label = 'convention'; Path = $conventionPath },
    @{ Label = 'case'; Path = $casePath },
    @{ Label = 'oracle'; Path = $oraclePath },
    @{ Label = 'record'; Path = $recordPath },
    @{ Label = 'validator'; Path = $validatorPath }
)

foreach ($item in $requiredPaths) {
    if (-not (Test-Path -LiteralPath $item.Path)) {
        Write-Fail "missing $($item.Label) file at $($item.Path)"
    }
}

$caseBase = [System.IO.Path]::GetFileNameWithoutExtension($casePath)
$oracleBase = [System.IO.Path]::GetFileNameWithoutExtension($oraclePath)
if ($caseBase -ne $oracleBase) {
    Write-Fail "case/oracle basename mismatch ($caseBase vs $oracleBase)"
}

$recordText = Get-Content -LiteralPath $recordPath -Raw -Encoding UTF8

$runSectionPattern = '(?ms)^###\s+(run-\d+)\s*\r?\n(.*?)(?=^###\s+run-|\z)'
$runMatches = [regex]::Matches($recordText, $runSectionPattern)

if ($runMatches.Count -ne 3) {
    Write-Fail "expected 3 counted runs, found $($runMatches.Count)"
}

$requiredFields = @(
    'run_id',
    'input_sha256',
    'model',
    'workspace',
    'fresh_context',
    'oracle_undisclosed_before_solve',
    'solver_summary',
    'evaluation'
)

$runIds = New-Object System.Collections.Generic.List[string]
$workspaces = New-Object System.Collections.Generic.List[string]
$inputHashes = New-Object System.Collections.Generic.List[string]

foreach ($match in $runMatches) {
    $sectionHeader = $match.Groups[1].Value
    $sectionBody = $match.Groups[2].Value

    foreach ($field in $requiredFields) {
        $fieldPattern = '(?m)^-\s+' + [regex]::Escape($field) + ':\s*(.+?)\s*$'
        $fieldMatch = [regex]::Match($sectionBody, $fieldPattern)
        if (-not $fieldMatch.Success) {
            Write-Fail "$sectionHeader missing $field"
        }
        $fieldValue = $fieldMatch.Groups[1].Value.Trim()

        switch ($field) {
            'run_id' {
                if ($fieldValue -ne $sectionHeader) {
                    Write-Fail "$sectionHeader run_id mismatch ($fieldValue)"
                }
                if ($runIds -contains $fieldValue) {
                    Write-Fail "duplicate run_id $fieldValue"
                }
                [void]$runIds.Add($fieldValue)
            }
            'input_sha256' {
                if (-not (Test-Sha256HexFormat -Value $fieldValue)) {
                    Write-Fail "$sectionHeader input_sha256 invalid format"
                }
                [void]$inputHashes.Add($fieldValue)
            }
            'workspace' {
                if ($workspaces -contains $fieldValue) {
                    Write-Fail "duplicate workspace $fieldValue"
                }
                [void]$workspaces.Add($fieldValue)
            }
        }
    }
}

$distinctHashes = @($inputHashes | Select-Object -Unique)
if ($distinctHashes.Count -ne 1) {
    Write-Fail "input_sha256 not identical across 3 runs"
}

$recordHash = [string]$distinctHashes[0]
$caseHash = Get-NormalizedCaseSha256Hex -FilePath $casePath
if ($recordHash -ne $caseHash) {
    Write-Fail "record input_sha256 does not match case file SHA-256"
}

Write-Output 'PASS: suite structure valid; counted_runs=3'
exit 0
