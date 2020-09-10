$A = $( foreach ($line in Get-Content .\structs_dump_b2060.txt) {
    $line.Split(' ', '	', ';', '>', '<', ',', ':', '.', '[', ']')
  }) | Sort-Object | Get-Unique

$A