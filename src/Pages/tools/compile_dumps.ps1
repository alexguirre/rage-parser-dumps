#Requires -Version 7.0
param (
    [Parameter(Mandatory=$true,HelpMessage="Path to the repository root directory.")]
    [string]
    $RootDir,
    [Parameter(Mandatory=$true,HelpMessage="Path to DumpFormatter.exe.")]
    [string]
    $DumpFormatterExePath,
    [Parameter(Mandatory=$true,HelpMessage="Path to output directory.")]
    [string]
    $OutputDir
)

if (!(Test-Path -Path $RootDir -PathType Container)) {
    Write-Error "-RootDir '$RootDir' does not exist" -ErrorAction Stop
}

if (!(Test-Path -Path $DumpFormatterExePath -PathType Leaf)) {
    Write-Error "-DumpFormatterExePath '$DumpFormatterExePath' does not exist" -ErrorAction Stop
}

New-Item -Path $OutputDir -ItemType Directory

$dictionary = "$RootDir\dumps\dictionary.txt"
$registry = "$RootDir\dumps\registry.json"

Copy-Item -Path $registry -Destination "$OutputDir\registry.json"

$games = (Get-Content $registry -Raw | ConvertFrom-Json).psobject.properties | Select-Object name,value

# Copy the JSON dumps and queue one DumpFormatter run per build and format
$work = foreach ($game in $games) {
    $name = $game.name
    foreach ($entry in $game.value) {
        $build = $entry.build

        New-Item -Path "$OutputDir\$name" -ItemType Directory -Force | Out-Null

        $jsonDump = "$RootDir\dumps\$name\b$build.json"
        $out = "$OutputDir\$name\b$build"
        Copy-Item -Path $jsonDump -Destination "$out.json"
        [pscustomobject]@{ Format = "html";      Json = $jsonDump; Output = "$out.html" }
        [pscustomobject]@{ Format = "plaintext"; Json = $jsonDump; Output = "$out.txt" }
        #[pscustomobject]@{ Format = "xsd";       Json = $jsonDump; Output = "$out.xsd" }
        [pscustomobject]@{ Format = "jsontree";  Json = $jsonDump; Output = "$out.tree.json" }
    }
}

# Capture each run's output so it prints as one block and its stderr doesn't abort the other runs
$failed = $work | ForEach-Object -ThrottleLimit ([Environment]::ProcessorCount) -Parallel {
    $log = & $using:DumpFormatterExePath --dictionary $using:dictionary $_.Format $_.Json $_.Output 2>&1
    Write-Host ($log -join "`n")
    if ($LASTEXITCODE -ne 0) {
        "$($_.Output) (exit code $LASTEXITCODE)"
    }
}

if ($failed) {
    Write-Error "DumpFormatter failed for:`n$($failed -join "`n")" -ErrorAction Stop
}

# .\tools\compile_dumps.ps1 -RootDir "D:\sources\gtav-DumpStructs" -DumpFormatterExePath "D:\sources\gtav-DumpStructs\src\DumpFormatter\bin\Debug\net6.0\DumpFormatter.exe" -OutputDir "./build"