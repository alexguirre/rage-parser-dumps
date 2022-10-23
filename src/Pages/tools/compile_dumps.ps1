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

foreach ($game in $games) {
    $name = $game.name
    foreach ($entry in $game.value) {
        $build = $entry.build

        New-Item -Path "$OutputDir\$name" -ItemType Directory -Force

        $jsonDump = "$RootDir\dumps\$name\b$build.json"
        Copy-Item -Path $jsonDump -Destination "$OutputDir\$name\b$build.json"
        & $DumpFormatterExePath --dictionary $dictionary html      $jsonDump "$OutputDir\$name\b$build.html"
        & $DumpFormatterExePath --dictionary $dictionary plaintext $jsonDump "$OutputDir\$name\b$build.txt"
        & $DumpFormatterExePath --dictionary $dictionary xsd       $jsonDump "$OutputDir\$name\b$build.xsd"
        & $DumpFormatterExePath --dictionary $dictionary jsontree  $jsonDump "$OutputDir\$name\b$build.tree.json"
    }
}

# .\tools\compile_dumps.ps1 -RootDir "D:\sources\gtav-DumpStructs" -DumpFormatterExePath "D:\sources\gtav-DumpStructs\src\DumpFormatter\bin\Debug\net6.0\DumpFormatter.exe" -OutputDir "./build"