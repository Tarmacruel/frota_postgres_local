param(
    [int[]]$Ports = @(8000, 5173, 80)
)

$ErrorActionPreference = "Stop"

$killed = @()
foreach ($port in $Ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (-not $connections) {
        continue
    }

    $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pid in $pids) {
        try {
            Stop-Process -Id $pid -Force -ErrorAction Stop
            $killed += [PSCustomObject]@{ Port = $port; PID = $pid }
        }
        catch {
            Write-Warning "Nao foi possivel encerrar o PID $pid da porta $port: $($_.Exception.Message)"
        }
    }
}

if ($killed.Count -eq 0) {
    Write-Output "Nenhum processo escutando nas portas informadas foi encontrado."
}
else {
    Write-Output "Processos encerrados:"
    $killed | Format-Table -AutoSize | Out-String | Write-Output
}
