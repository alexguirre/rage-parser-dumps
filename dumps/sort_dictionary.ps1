$dict = [System.Collections.Generic.List[string]]::new([string[]](Get-Content .\dictionary.txt))
$dict.Sort([System.StringComparer]::Ordinal)
$dict | Get-Unique | Set-Content .\dictionary.txt