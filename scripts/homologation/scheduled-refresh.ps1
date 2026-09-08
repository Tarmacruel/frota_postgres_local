[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "common.ps1")

[void](Assert-HmlRepository)
try {
    [void](Assert-HmlSecureVolume)
}
catch {
    [void](Connect-HmlSecureVolume)
}

& (Join-Path $PSScriptRoot "refresh.ps1") -WaitUntilCutoff -RequireSyntheticTargets
exit $LASTEXITCODE
