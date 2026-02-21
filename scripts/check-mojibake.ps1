param(
    [switch]$All
)

$ErrorActionPreference = 'Stop'

$tokens = @(
    'Ã',
    'ðŸ',
    'â€”',
    'â€“',
    'â€œ',
    'â€',
    'ï¿½'
)

$extensions = @('.html', '.css', '.js', '.json', '.md', '.txt')
$findings = @()

function Test-Line {
    param(
        [string]$File,
        [int]$Line,
        [string]$Text
    )

    foreach ($token in $tokens) {
        if ($Text.Contains($token)) {
            return [PSCustomObject]@{
                File  = $File
                Line  = $Line
                Token = $token
                Text  = $Text.Trim()
            }
        }
    }
    return $null
}

if ($All) {
    $targets = @('index.html', 'css', 'js', 'manifest.json', 'sw.js', 'README.md')
    $files = @()

    foreach ($target in $targets) {
        if (-not (Test-Path $target)) { continue }
        $item = Get-Item $target

        if ($item.PSIsContainer) {
            $files += Get-ChildItem -Path $item.FullName -Recurse -File |
                Where-Object {
                    $_.Extension -in $extensions -and
                    $_.FullName -notmatch '\\libs\\'
                }
        } else {
            $files += $item
        }
    }

    foreach ($file in ($files | Sort-Object FullName -Unique)) {
        $lines = Get-Content -Path $file.FullName -Encoding UTF8
        for ($i = 0; $i -lt $lines.Count; $i++) {
            $r = Test-Line -File $file.FullName -Line ($i + 1) -Text $lines[$i]
            if ($null -ne $r) { $findings += $r }
        }
    }
}
else {
    $changedFiles = git diff --cached --name-only --diff-filter=ACMR
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Erro ao ler arquivos staged do git.' -ForegroundColor Red
        exit 2
    }

    $candidateFiles = $changedFiles |
        Where-Object {
            $ext = [System.IO.Path]::GetExtension($_)
            $extensions -contains $ext -and $_ -notmatch '^libs/'
        }

    if (-not $candidateFiles -or $candidateFiles.Count -eq 0) {
        Write-Host 'OK: nenhum arquivo textual staged para validar.' -ForegroundColor Green
        exit 0
    }

    foreach ($file in $candidateFiles) {
        $diff = git diff --cached -U0 -- $file
        if ($LASTEXITCODE -ne 0) { continue }

        $newLine = 0
        foreach ($line in $diff) {
            if ($line -match '^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@') {
                $newLine = [int]$matches[1]
                continue
            }

            if ($line.StartsWith('+++')) { continue }
            if ($line.StartsWith('diff ') -or $line.StartsWith('index ') -or $line.StartsWith('---')) { continue }

            if ($line.StartsWith('+')) {
                $content = $line.Substring(1)
                $r = Test-Line -File $file -Line $newLine -Text $content
                if ($null -ne $r) { $findings += $r }
                $newLine++
                continue
            }

            if ($line.StartsWith('-')) {
                continue
            }

            if ($line.StartsWith(' ')) {
                $newLine++
            }
        }
    }
}

if ($findings.Count -gt 0) {
    Write-Host 'Mojibake detectado:' -ForegroundColor Red
    $findings | ForEach-Object {
        Write-Host ("- {0}:{1} [{2}] {3}" -f $_.File, $_.Line, $_.Token, $_.Text)
    }
    Write-Host ''
    Write-Host 'Dica: valide encoding UTF-8 e corrija apenas as linhas novas.' -ForegroundColor Yellow
    exit 1
}

Write-Host 'OK: nenhum padrão de mojibake encontrado nas alterações staged.' -ForegroundColor Green
exit 0
