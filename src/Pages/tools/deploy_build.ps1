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

Push-Location "$RootDir\src\Pages\"
npm i
npm run build
Pop-Location

New-Item -Path $OutputDir -ItemType Directory
$includes = "css","fonts","img","js","*.html","favicon.ico"
foreach ($include in $includes) {
    Copy-Item -Path "$RootDir\src\Pages\$include" -Destination $OutputDir -Recurse -Force
}

& "$PSScriptRoot\compile_dumps.ps1" -RootDir $RootDir -DumpFormatterExePath $DumpFormatterExePath -OutputDir "$OutputDir\dumps"