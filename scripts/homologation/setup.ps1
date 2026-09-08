[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param(
    [switch]$ProvisionSecureVolume,
    [switch]$InitializeRuntime,
    [switch]$InstallDependencies,
    [string]$RecoveryKeyOutputPath = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "common.ps1")

$repoRoot = Assert-HmlRepository
$secureRoot = Split-Path $script:HmlExpectedVhdx -Parent
$dpapiRoot = Join-Path $env:LOCALAPPDATA "FrotaPMTF\Homologation"
$dpapiPath = Join-Path $dpapiRoot "frota-hml-unlock.dpapi"

function New-HmlSecret {
    param([int]$ByteCount = 48)

    $bytes = New-Object byte[] $ByteCount
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return ([Convert]::ToBase64String($bytes)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Set-HmlPrivateFileAcl {
    param([Parameter(Mandatory = $true)][string]$Path)

    $acl = Get-Acl -LiteralPath $Path
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($existingRule in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($existingRule) }
    foreach ($sidValue in @(
        [Security.Principal.WindowsIdentity]::GetCurrent().User.Value,
        "S-1-5-18",
        "S-1-5-32-544"
    )) {
        $sid = [Security.Principal.SecurityIdentifier]::new($sidValue)
        $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, [Security.AccessControl.FileSystemRights]::FullControl, [Security.AccessControl.AccessControlType]::Allow)
        [void]$acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}

function Save-HmlUnlockMaterial {
    param(
        [Parameter(Mandatory = $true)][string]$RecoveryPassword,
        [Parameter(Mandatory = $true)][string]$ExternalRecoveryPath
    )

    if ([string]::IsNullOrWhiteSpace($ExternalRecoveryPath)) {
        throw "-RecoveryKeyOutputPath is required and must point outside drive D: and outside Git."
    }
    $externalFull = [IO.Path]::GetFullPath($ExternalRecoveryPath)
    if ([IO.Path]::GetPathRoot($externalFull).TrimEnd('\') -ieq "D:") {
        throw "The BitLocker recovery key must not be stored on drive D:."
    }
    if (Test-HmlPathWithin -Path $externalFull -Root $repoRoot) {
        throw "The BitLocker recovery key must not be stored in the Git clone."
    }
    $externalParent = Split-Path $externalFull -Parent
    if (-not (Test-Path -LiteralPath $externalParent -PathType Container)) {
        throw "Recovery key destination directory does not exist: '$externalParent'."
    }

    $secureValue = ConvertTo-SecureString -String $RecoveryPassword -AsPlainText -Force
    if (-not (Test-Path -LiteralPath $dpapiRoot)) { New-Item -ItemType Directory -Path $dpapiRoot -Force | Out-Null }
    $secureValue | ConvertFrom-SecureString | Set-Content -LiteralPath $dpapiPath -Encoding ASCII
    Set-HmlPrivateFileAcl -Path $dpapiRoot
    Set-HmlPrivateFileAcl -Path $dpapiPath

    @(
        "FROTA PMTF - HOMOLOGATION BITLOCKER RECOVERY KEY"
        "VHDX: $script:HmlExpectedVhdx"
        "Created: $((Get-Date).ToUniversalTime().ToString('o'))"
        "Recovery password: $RecoveryPassword"
    ) | Set-Content -LiteralPath $externalFull -Encoding UTF8
    Set-HmlPrivateFileAcl -Path $externalFull
}

function New-HmlSecureVolume {
    Assert-HmlAdministrator
    if (-not (Get-Command Enable-BitLocker -ErrorAction SilentlyContinue)) { throw "BitLocker PowerShell cmdlets are unavailable." }
    $hyperVAvailable = (Get-Command New-VHD -ErrorAction SilentlyContinue) -and (Get-Command Mount-VHD -ErrorAction SilentlyContinue)
    $diskPartAvailable = Get-Command diskpart.exe -ErrorAction SilentlyContinue
    $diskImageAvailable = (Get-Command Get-DiskImage -ErrorAction SilentlyContinue) -and (Get-Command Get-Disk -ErrorAction SilentlyContinue)
    if (-not $hyperVAvailable -and (-not $diskPartAvailable -or -not $diskImageAvailable)) { throw "Neither Hyper-V PowerShell nor a complete diskpart/Get-DiskImage fallback is available to create the VHDX." }
    if (Test-Path -LiteralPath $script:HmlExpectedVhdx) {
        throw "VHDX already exists. Refusing to overwrite '$script:HmlExpectedVhdx'."
    }
    if (Test-Path -LiteralPath $script:HmlExpectedMount) {
        $children = Get-ChildItem -LiteralPath $script:HmlExpectedMount -Force -ErrorAction SilentlyContinue
        if ($children) { throw "Mount directory must be empty before provisioning: '$script:HmlExpectedMount'." }
    }

    $createdSecureRoot = -not (Test-Path -LiteralPath $secureRoot)
    if ($createdSecureRoot) { New-Item -ItemType Directory -Path $secureRoot -Force | Out-Null }
    if (-not (Test-Path -LiteralPath $script:HmlExpectedMount)) { New-Item -ItemType Directory -Path $script:HmlExpectedMount -Force | Out-Null }
    if ($createdSecureRoot) { Set-HmlSecureAcl -Path $secureRoot }

    try {
        if ($hyperVAvailable) {
            [void](New-VHD -Path $script:HmlExpectedVhdx -Dynamic -SizeBytes 32GB -ErrorAction Stop)
            $diskImage = Mount-VHD -Path $script:HmlExpectedVhdx -NoDriveLetter -PassThru -ErrorAction Stop
            $disk = $diskImage | Get-Disk
            Initialize-Disk -Number $disk.Number -PartitionStyle GPT -ErrorAction Stop | Out-Null
            $partition = New-Partition -DiskNumber $disk.Number -UseMaximumSize -ErrorAction Stop
            $volume = Format-Volume -Partition $partition -FileSystem NTFS -NewFileSystemLabel "FROTA-HML-SECURE" -Confirm:$false -Force
            Add-PartitionAccessPath -DiskNumber $disk.Number -PartitionNumber $partition.PartitionNumber -AccessPath $script:HmlExpectedMount
        }
        else {
            $diskPartScript = Join-Path ([IO.Path]::GetTempPath()) "frota-hml-vhdx-$([guid]::NewGuid().ToString('N')).txt"
            @(
                "create vdisk file=`"$script:HmlExpectedVhdx`" maximum=32768 type=expandable"
                "select vdisk file=`"$script:HmlExpectedVhdx`""
                "attach vdisk"
                "convert gpt"
                "create partition primary"
                "format fs=ntfs quick label=`"FROTA-HML-SECURE`""
                "assign mount=`"$script:HmlExpectedMount\`""
            ) | Set-Content -LiteralPath $diskPartScript -Encoding ASCII
            try {
                & $diskPartAvailable.Source /s $diskPartScript | Out-Null
                if ($LASTEXITCODE -ne 0) { throw "diskpart.exe failed with exit code $LASTEXITCODE." }
            }
            finally { Remove-Item -LiteralPath $diskPartScript -Force -ErrorAction SilentlyContinue }
            if (-not (Test-Path -LiteralPath $script:HmlExpectedVhdx -PathType Leaf)) { throw "diskpart.exe did not create the expected VHDX." }
            $diskImage = Get-DiskImage -ImagePath $script:HmlExpectedVhdx -ErrorAction Stop
            $disk = $diskImage | Get-Disk
            $partition = Get-Partition -DiskNumber $disk.Number | Where-Object Type -eq "Basic" | Sort-Object Size -Descending | Select-Object -First 1
            $volume = $partition | Get-Volume
            if (-not $volume -or $volume.FileSystemLabel -ne "FROTA-HML-SECURE") { throw "diskpart.exe did not create the expected NTFS volume." }
        }
        Set-HmlPrivateFileAcl -Path $script:HmlExpectedVhdx

        $bitLocker = Enable-BitLocker -MountPoint $volume.Path -EncryptionMethod XtsAes256 -UsedSpaceOnly -RecoveryPasswordProtector -SkipHardwareTest
        $deadline = (Get-Date).AddMinutes(10)
        do {
            Start-Sleep -Seconds 3
            $bitLocker = Get-BitLockerVolume -MountPoint $volume.Path
            if ((Get-Date) -ge $deadline) { throw "Timed out while waiting for BitLocker encryption." }
        } until ($bitLocker.VolumeStatus.ToString() -eq "FullyEncrypted" -and $bitLocker.ProtectionStatus.ToString() -eq "On")

        $recovery = $bitLocker.KeyProtector | Where-Object KeyProtectorType -eq "RecoveryPassword" | Select-Object -First 1
        if (-not $recovery -or [string]::IsNullOrWhiteSpace($recovery.RecoveryPassword)) {
            throw "BitLocker did not return a recovery password."
        }
        Save-HmlUnlockMaterial -RecoveryPassword $recovery.RecoveryPassword -ExternalRecoveryPath $RecoveryKeyOutputPath
        Set-HmlSecureAcl -Path $script:HmlExpectedMount
        [ordered]@{
            schemaVersion = 1
            environment = "homologation"
            repositoryRoot = $repoRoot
            createdAt = (Get-Date).ToUniversalTime().ToString("o")
        } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $script:HmlExpectedMount ".frota-hml-secure-volume.json") -Encoding UTF8
    }
    catch {
        Write-Warning "Provisioning failed. The new VHDX was not removed automatically; inspect it before any manual cleanup."
        throw
    }
}

function Initialize-HmlPostgres {
    param(
        [Parameter(Mandatory = $true)][string]$SuperUser,
        [Parameter(Mandatory = $true)][string]$SuperPassword,
        [Parameter(Mandatory = $true)][string]$ApplicationUser,
        [Parameter(Mandatory = $true)][string]$ApplicationPassword
    )

    $dataRoot = Join-Path $script:HmlExpectedMount "postgres-data"
    $pgBin = Find-HmlPostgresBin
    if (-not (Test-Path -LiteralPath (Join-Path $dataRoot "PG_VERSION"))) {
        if (-not (Test-Path -LiteralPath $dataRoot)) { New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null }
        $passwordFile = Join-Path $script:HmlExpectedMount "runtime\initdb-password.tmp"
        Set-Content -LiteralPath $passwordFile -Value $SuperPassword -Encoding ASCII
        try {
            & (Join-Path $pgBin "initdb.exe") -D $dataRoot -U $SuperUser -E UTF8 --locale=C --auth-host=scram-sha-256 --auth-local=scram-sha-256 --pwfile=$passwordFile
            if ($LASTEXITCODE -ne 0) { throw "initdb failed with exit code $LASTEXITCODE." }
        }
        finally {
            if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile -Force }
        }
    }

    Start-HmlPostgres -Config ([pscustomobject]@{})
    $oldPassword = $env:PGPASSWORD
    $env:PGPASSWORD = $SuperPassword
    try {
        $escapedRole = $ApplicationUser.Replace('"', '""')
        $escapedPassword = $ApplicationPassword.Replace("'", "''")
        $roleExists = & (Join-Path $pgBin "psql.exe") -w -h 127.0.0.1 -p 5440 -U $SuperUser -d postgres -tA -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_roles WHERE rolname='$($ApplicationUser.Replace("'", "''"))';"
        if ($LASTEXITCODE -ne 0) { throw "Unable to inspect the isolated application role." }
        if (-not (($roleExists | Out-String).Trim())) {
            & (Join-Path $pgBin "psql.exe") -w -h 127.0.0.1 -p 5440 -U $SuperUser -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE `"$escapedRole`" LOGIN PASSWORD '$escapedPassword';"
            if ($LASTEXITCODE -ne 0) { throw "Unable to create the isolated application role." }
        }
        else {
            & (Join-Path $pgBin "psql.exe") -w -h 127.0.0.1 -p 5440 -U $SuperUser -d postgres -v ON_ERROR_STOP=1 -c "ALTER ROLE `"$escapedRole`" PASSWORD '$escapedPassword';"
            if ($LASTEXITCODE -ne 0) { throw "Unable to synchronize the isolated application role password." }
        }

        $databaseExists = & (Join-Path $pgBin "psql.exe") -w -h 127.0.0.1 -p 5440 -U $SuperUser -d postgres -tA -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname='frota_hml';"
        if ($LASTEXITCODE -ne 0) { throw "Unable to inspect the isolated database." }
        if (-not (($databaseExists | Out-String).Trim())) {
            & (Join-Path $pgBin "psql.exe") -w -h 127.0.0.1 -p 5440 -U $SuperUser -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE frota_hml OWNER `"$escapedRole`";"
            if ($LASTEXITCODE -ne 0) { throw "Unable to create the isolated database." }
        }
    }
    finally {
        if ($null -eq $oldPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $oldPassword }
    }
}

function Initialize-HmlRuntime {
    $mount = Assert-HmlSecureVolume
    $configPath = Join-Path $mount "config\homologation.json"
    if (Test-Path -LiteralPath $configPath) {
        $existingConfig = Get-HmlConfiguration
        $existingEnv = Join-Path $mount "config\backend.env"
        if (-not $existingConfig.database.superPassword -or -not $existingConfig.database.applicationPassword -or -not (Test-Path -LiteralPath $existingEnv)) {
            throw "Runtime initialization is incomplete and cannot be resumed safely without the existing secrets."
        }
        Initialize-HmlPostgres -SuperUser $existingConfig.database.superUser -SuperPassword $existingConfig.database.superPassword -ApplicationUser $existingConfig.database.applicationUser -ApplicationPassword $existingConfig.database.applicationPassword
        Set-HmlSecureAcl -Path $mount
        Write-Host "Existing secure runtime validated without rotating secrets." -ForegroundColor Green
        return
    }
    foreach ($directory in @("config", "data\uploads", "data\artifacts", "evidence", "logs", "refresh", "runtime", "snapshots")) {
        New-Item -ItemType Directory -Path (Join-Path $mount $directory) -Force | Out-Null
    }

    $superPassword = New-HmlSecret -ByteCount 36
    $applicationPassword = New-HmlSecret -ByteCount 36
    $secretKey = New-HmlSecret
    $evidenceSecret = New-HmlSecret
    $config = Get-Content -LiteralPath (Join-Path $PSScriptRoot "homologation.config.example.json") -Raw | ConvertFrom-Json
    $config.database | Add-Member -NotePropertyName superPassword -NotePropertyValue $superPassword
    $config.database | Add-Member -NotePropertyName applicationPassword -NotePropertyValue $applicationPassword
    $config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $configPath -Encoding UTF8

    $encodedPassword = [Uri]::EscapeDataString($applicationPassword)
    $envPath = Join-Path $mount "config\backend.env"
    @(
        "DATABASE_URL=postgresql+asyncpg://frota_hml_app:$encodedPassword@127.0.0.1:5440/frota_hml"
        "SECRET_KEY=$secretKey"
        "SIGNATURE_EVIDENCE_SECRET=$evidenceSecret"
        "ALGORITHM=HS256"
        "ACCESS_TOKEN_EXPIRE_MINUTES=60"
        "STORAGE_DIR=$((Join-Path $mount 'data\uploads'))"
        'CORS_ORIGINS=["http://127.0.0.1:3010"]'
        'CSRF_TRUSTED_ORIGINS=["http://127.0.0.1:3010"]'
        "COOKIE_NAME=frota_hml_access_token"
        "CSRF_COOKIE_NAME=frota_hml_csrf_token"
        "COOKIE_SECURE=false"
        'TRUSTED_PROXY_NETWORKS=[]'
        'TRUSTED_HOSTS=["127.0.0.1","localhost","test","testserver"]'
        "MAX_USER_AGENT_LENGTH=256"
        "MAX_REQUEST_BODY_BYTES=67108864"
        "APP_ENV=homologation"
        "ENABLE_LEGACY_FUEL_SUPPLY_CREATE=false"
        "CERTIFICATE_SIGNING_ENABLED=false"
        "CANONICAL_DOCUMENT_ARTIFACTS_ENABLED=false"
        "SIGNATURE_AGENT_ENABLED=false"
        "HOMOLOGATION_CERTIFICATE_TARGETS_ONLY=true"
        "DIGITAL_DOCUMENT_ARTIFACTS_DIR=$((Join-Path $mount 'data\artifacts'))"
    ) | Set-Content -LiteralPath $envPath -Encoding UTF8

    Initialize-HmlPostgres -SuperUser $config.database.superUser -SuperPassword $superPassword -ApplicationUser $config.database.applicationUser -ApplicationPassword $applicationPassword

    Set-HmlSecureAcl -Path $mount
}

function Install-HmlDependencies {
    $python = Get-Command python.exe -ErrorAction SilentlyContinue
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $python) { throw "Python was not found in PATH." }
    if (-not $npm) { throw "npm was not found in PATH." }

    $venvRoot = Join-Path $repoRoot "backend\.venv"
    if (-not (Test-Path -LiteralPath (Join-Path $venvRoot "Scripts\python.exe"))) {
        & $python.Source -m venv $venvRoot
        if ($LASTEXITCODE -ne 0) { throw "Unable to create the isolated Python virtual environment." }
    }
    & (Join-Path $venvRoot "Scripts\python.exe") -m pip install --require-virtualenv -r (Join-Path $repoRoot "backend\requirements.txt")
    if ($LASTEXITCODE -ne 0) { throw "Backend dependency installation failed." }
    & $npm.Source ci --prefix (Join-Path $repoRoot "frontend")
    if ($LASTEXITCODE -ne 0) { throw "Frontend dependency installation failed." }
}

if (-not $ProvisionSecureVolume -and -not $InitializeRuntime -and -not $InstallDependencies) {
    Write-Host "No changes requested. Use explicit switches; see docs/certificado-digital/runbook-homologacao.md."
    exit 0
}

if ($ProvisionSecureVolume) {
    if ($PSCmdlet.ShouldProcess($script:HmlExpectedVhdx, "Create, mount and encrypt the 32 GB homologation VHDX")) {
        New-HmlSecureVolume
    }
}
if ($InitializeRuntime) {
    if ($PSCmdlet.ShouldProcess($script:HmlExpectedMount, "Initialize isolated configuration and PostgreSQL")) {
        Initialize-HmlRuntime
    }
}
if ($InstallDependencies) {
    if ($PSCmdlet.ShouldProcess($repoRoot, "Install independent backend and frontend dependencies")) {
        Install-HmlDependencies
    }
}

Write-Host "Homologation setup step completed." -ForegroundColor Green
