[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$IsoPath,
    [Parameter(Mandatory = $true)][string]$VirtualSwitchName,
    [string]$VmName = "Frota-Docker",
    [Parameter(Mandatory = $true)][string]$VhdDirectory,
    [ValidateRange(4, 64)][int]$MemoryStartupGB = 8,
    [ValidateRange(2, 32)][int]$ProcessorCount = 4,
    [ValidateRange(64, 2048)][int]$VhdSizeGB = 100,
    [switch]$Start
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Get-Command Get-VM -ErrorAction SilentlyContinue)) {
    throw "Os cmdlets Hyper-V nao estao disponiveis neste servidor. Instale a funcao Hyper-V antes de criar a VM."
}

if (-not (Test-Path -LiteralPath $IsoPath)) {
    throw "ISO Ubuntu nao encontrada: $IsoPath"
}

if (Get-VM -Name $VmName -ErrorAction SilentlyContinue) {
    throw "Ja existe uma VM com o nome '$VmName'."
}

if (-not (Get-VMSwitch -Name $VirtualSwitchName -ErrorAction SilentlyContinue)) {
    throw "Switch virtual Hyper-V nao encontrado: $VirtualSwitchName"
}

$vhdDirectoryFull = [System.IO.Path]::GetFullPath($VhdDirectory)
$driveName = ([System.IO.Path]::GetPathRoot($vhdDirectoryFull)).Substring(0, 1)
$drive = Get-PSDrive -Name $driveName -ErrorAction SilentlyContinue
if (-not $drive -or $drive.DisplayRoot) {
    throw "VhdDirectory deve estar em disco local do SAD61SVR001, nunca em unidade SMB/mapeada: $vhdDirectoryFull"
}

New-Item -ItemType Directory -Force -Path $vhdDirectoryFull | Out-Null
$vhdPath = Join-Path $vhdDirectoryFull "$VmName.vhdx"
New-VHD -Path $vhdPath -Dynamic -SizeBytes ($VhdSizeGB * 1GB) | Out-Null

$vm = New-VM `
    -Name $VmName `
    -Generation 2 `
    -MemoryStartupBytes ($MemoryStartupGB * 1GB) `
    -VHDPath $vhdPath `
    -SwitchName $VirtualSwitchName

Set-VMProcessor -VMName $VmName -Count $ProcessorCount
Set-VMMemory -VMName $VmName -DynamicMemoryEnabled $false
Add-VMDvdDrive -VMName $VmName -Path $IsoPath | Out-Null
$dvd = Get-VMDvdDrive -VMName $VmName
Set-VMFirmware -VMName $VmName -FirstBootDevice $dvd

$adapter = Get-VMNetworkAdapter -VMName $VmName | Select-Object -First 1
Write-Host "VM criada: $VmName" -ForegroundColor Green
Write-Host "VHD local: $vhdPath"
Write-Host "MAC para reserva DHCP: $($adapter.MacAddress)" -ForegroundColor Cyan
Write-Host "Apos criar a reserva DHCP, conclua a instalacao Ubuntu e execute deploy\\ubuntu\\bootstrap-frota-vm.sh." -ForegroundColor Yellow

if ($Start) {
    Start-VM -Name $VmName
    Write-Host "VM iniciada para instalacao do Ubuntu." -ForegroundColor Green
}
