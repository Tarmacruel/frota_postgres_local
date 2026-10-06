Set-StrictMode -Version Latest

$script:HmlExpectedRoot = "D:\FROTAS\frota_certificado_homologacao"
$script:HmlExpectedBranch = "feature/certificado-digital-hml"
$script:HmlExpectedVhdx = "D:\FROTAS\.secure\frota-certificado-hml-data.vhdx"
$script:HmlExpectedMount = Join-Path $script:HmlExpectedRoot ".runtime-secure"
$script:HmlMinimumFreeBytes = 10GB
$script:HmlReservedPorts = @(80, 5432, 8000)
$script:HmlPorts = [ordered]@{
    Frontend = 3010
    Backend = 8010
    Postgres = 5440
    SignerAgent = 54174
}

function Get-HmlNormalizedPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $full = [System.IO.Path]::GetFullPath($Path)
    return $full.TrimEnd([char[]]@(92, 47))
}

function Test-HmlPathWithin {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Root
    )

    $candidate = Get-HmlNormalizedPath -Path $Path
    $parent = Get-HmlNormalizedPath -Path $Root
    if ($candidate.Equals($parent, [StringComparison]::OrdinalIgnoreCase)) {
        return $true
    }
    return $candidate.StartsWith("$parent\", [StringComparison]::OrdinalIgnoreCase)
}

function Assert-HmlPathWithin {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Root,
        [string]$Label = "Path"
    )

    if (-not (Test-HmlPathWithin -Path $Path -Root $Root)) {
        throw "$Label must remain within '$Root': $Path"
    }
}

function Assert-HmlRepository {
    param([switch]$SkipBranchCheck)

    $actualRoot = Get-HmlNormalizedPath -Path (Join-Path $PSScriptRoot "..\..")
    if (-not $actualRoot.Equals((Get-HmlNormalizedPath -Path $script:HmlExpectedRoot), [StringComparison]::OrdinalIgnoreCase)) {
        throw "Homologation scripts only run from '$script:HmlExpectedRoot'. Current path: '$actualRoot'."
    }

    if (-not (Test-Path -LiteralPath (Join-Path $actualRoot ".git"))) {
        throw "The expected independent Git clone was not found at '$actualRoot'."
    }

    if (-not $SkipBranchCheck) {
        $branch = (& git -C $actualRoot branch --show-current 2>$null).Trim()
        if ($LASTEXITCODE -ne 0 -or $branch -ne $script:HmlExpectedBranch) {
            throw "Expected branch '$script:HmlExpectedBranch'; current branch is '$branch'."
        }
    }
    return $actualRoot
}

function Test-HmlAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Assert-HmlAdministrator {
    if (-not (Test-HmlAdministrator)) {
        throw "This operation requires an elevated PowerShell session."
    }
}

function Connect-HmlSecureVolume {
    Assert-HmlAdministrator
    if (-not (Get-Command Unlock-BitLocker -ErrorAction SilentlyContinue)) { throw "BitLocker PowerShell cmdlets are unavailable." }
    $hyperVAvailable = (Get-Command Get-VHD -ErrorAction SilentlyContinue) -and (Get-Command Mount-VHD -ErrorAction SilentlyContinue)
    $diskImageAvailable = (Get-Command Get-DiskImage -ErrorAction SilentlyContinue) -and (Get-Command Mount-DiskImage -ErrorAction SilentlyContinue)
    if (-not $hyperVAvailable -and -not $diskImageAvailable) { throw "No supported VHDX mounting commands are available." }
    if (-not (Test-Path -LiteralPath $script:HmlExpectedVhdx -PathType Leaf)) {
        throw "Homologation VHDX does not exist: '$script:HmlExpectedVhdx'."
    }
    if (-not (Test-Path -LiteralPath $script:HmlExpectedMount)) {
        New-Item -ItemType Directory -Path $script:HmlExpectedMount -Force | Out-Null
    }

    if ($hyperVAvailable) {
        $image = Get-VHD -Path $script:HmlExpectedVhdx -ErrorAction Stop
        if (-not $image.Attached) { $image = Mount-VHD -Path $script:HmlExpectedVhdx -NoDriveLetter -PassThru -ErrorAction Stop }
        $diskNumber = $image.DiskNumber
    }
    else {
        $image = Get-DiskImage -ImagePath $script:HmlExpectedVhdx -ErrorAction Stop
        if (-not $image.Attached) { $image = Mount-DiskImage -ImagePath $script:HmlExpectedVhdx -NoDriveLetter -PassThru -ErrorAction Stop }
        $diskNumber = ($image | Get-Disk -ErrorAction Stop).Number
    }
    $partition = Get-Partition -DiskNumber $diskNumber -ErrorAction Stop |
        Where-Object { $_.Type -eq "Basic" -or $_.GptType -eq "{EBD0A0A2-B9E5-4433-87C0-68B6B72699C7}" } |
        Sort-Object Size -Descending |
        Select-Object -First 1
    if (-not $partition) { throw "No data partition was found in the homologation VHDX." }

    if (-not ($partition.AccessPaths | Where-Object { (Get-HmlNormalizedPath $_) -eq (Get-HmlNormalizedPath $script:HmlExpectedMount) })) {
        Add-PartitionAccessPath -DiskNumber $diskNumber -PartitionNumber $partition.PartitionNumber -AccessPath $script:HmlExpectedMount
    }
    $volume = $partition | Get-Volume
    $bitLocker = Get-BitLockerVolume -MountPoint $volume.Path
    if ($bitLocker.LockStatus.ToString() -eq "Locked") {
        $dpapiPath = Join-Path $env:LOCALAPPDATA "FrotaPMTF\Homologation\frota-hml-unlock.dpapi"
        if (-not (Test-Path -LiteralPath $dpapiPath -PathType Leaf)) {
            throw "The current Windows user has no DPAPI-protected unlock material."
        }
        $securePassword = Get-Content -LiteralPath $dpapiPath -Raw | ConvertTo-SecureString
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        try {
            $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
            Unlock-BitLocker -MountPoint $volume.Path -RecoveryPassword $plainPassword | Out-Null
        }
        finally {
            $plainPassword = $null
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    }
    Set-HmlSecureAcl -Path $script:HmlExpectedMount
    [void](Assert-HmlSecureVolume)
    return $script:HmlExpectedMount
}

function Get-HmlVolumeForPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $resolved = Resolve-Path -LiteralPath $Path -ErrorAction Stop
    return Get-Volume -FilePath $resolved.Path -ErrorAction Stop
}

function Test-HmlSecureAcl {
    param([Parameter(Mandatory = $true)][string]$Path)

    $acl = Get-Acl -LiteralPath $Path
    if (-not $acl.AreAccessRulesProtected) {
        return $false
    }

    $allowedSids = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    [void]$allowedSids.Add([Security.Principal.WindowsIdentity]::GetCurrent().User.Value)
    [void]$allowedSids.Add("S-1-5-18")
    [void]$allowedSids.Add("S-1-5-32-544")
    $observedSids = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)

    foreach ($rule in $acl.Access) {
        if ($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) {
            continue
        }
        try {
            $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        }
        catch {
            return $false
        }
        if (-not $allowedSids.Contains($sid)) {
            return $false
        }
        [void]$observedSids.Add($sid)
    }
    foreach ($requiredSid in $allowedSids) {
        if (-not $observedSids.Contains($requiredSid)) { return $false }
    }
    return $true
}

function Set-HmlSecureAcl {
    param([Parameter(Mandatory = $true)][string]$Path)

    Assert-HmlAdministrator
    $acl = Get-Acl -LiteralPath $Path
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($existingRule in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($existingRule) }
    foreach ($sidValue in @(
        [Security.Principal.WindowsIdentity]::GetCurrent().User.Value,
        "S-1-5-18",
        "S-1-5-32-544"
    )) {
        $sid = [Security.Principal.SecurityIdentifier]::new($sidValue)
        $rule = [Security.AccessControl.FileSystemAccessRule]::new(
            $sid,
            [Security.AccessControl.FileSystemRights]::FullControl,
            ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),
            [Security.AccessControl.PropagationFlags]::None,
            [Security.AccessControl.AccessControlType]::Allow
        )
        [void]$acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}

function Get-HmlBitLockerState {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Get-Command Get-BitLockerVolume -ErrorAction SilentlyContinue)) {
        throw "BitLocker PowerShell cmdlets are unavailable."
    }
    $volume = Get-HmlVolumeForPath -Path $Path
    return Get-BitLockerVolume -MountPoint $volume.Path -ErrorAction Stop
}

function Assert-HmlSecureVolume {
    param([switch]$AllowLowFreeSpace)

    $repoRoot = Assert-HmlRepository
    $mount = $script:HmlExpectedMount
    $marker = Join-Path $mount ".frota-hml-secure-volume.json"
    if (-not (Test-Path -LiteralPath $mount -PathType Container) -or -not (Test-Path -LiteralPath $marker -PathType Leaf)) {
        throw "The encrypted homologation volume is not mounted at '$mount'."
    }

    $markerData = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
    if ($markerData.environment -ne "homologation" -or $markerData.repositoryRoot -ne $repoRoot) {
        throw "The mounted volume marker does not belong to this homologation clone."
    }

    $volume = Get-HmlVolumeForPath -Path $mount
    if ($volume.FileSystemLabel -ne "FROTA-HML-SECURE") {
        throw "Unexpected volume label '$($volume.FileSystemLabel)'."
    }

    $bitLocker = Get-HmlBitLockerState -Path $mount
    if (-not $bitLocker -or $bitLocker.ProtectionStatus.ToString() -ne "On" -or $bitLocker.VolumeStatus.ToString() -ne "FullyEncrypted") {
        throw "The homologation volume must be fully encrypted and protected by BitLocker."
    }
    if (-not (Test-HmlSecureAcl -Path $mount)) {
        throw "The homologation volume ACL is not restricted to the authorized user, SYSTEM and Administrators."
    }
    if (-not $AllowLowFreeSpace -and $volume.SizeRemaining -lt $script:HmlMinimumFreeBytes) {
        throw "The homologation volume has less than 10 GB free."
    }
    return $mount
}

function Get-HmlConfiguration {
    param([switch]$SkipVolumeValidation)

    $mount = if ($SkipVolumeValidation) { $script:HmlExpectedMount } else { Assert-HmlSecureVolume }
    $path = Join-Path $mount "config\homologation.json"
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Homologation configuration is missing: '$path'."
    }
    $config = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    if ($config.schemaVersion -ne 1 -or $config.environment -ne "homologation") {
        throw "Unsupported or unsafe homologation configuration."
    }
    if ((Get-HmlNormalizedPath $config.repositoryRoot) -ne (Get-HmlNormalizedPath $script:HmlExpectedRoot)) {
        throw "Configuration repositoryRoot is invalid."
    }
    if ((Get-HmlNormalizedPath $config.secureVhdxPath) -ne (Get-HmlNormalizedPath $script:HmlExpectedVhdx)) {
        throw "Configuration secureVhdxPath is invalid."
    }
    if ((Get-HmlNormalizedPath $config.secureMountPath) -ne (Get-HmlNormalizedPath $script:HmlExpectedMount)) {
        throw "Configuration secureMountPath is invalid."
    }
    if ($config.ports.frontend -ne 3010 -or $config.ports.backend -ne 8010 -or $config.ports.postgres -ne 5440 -or $config.ports.signerAgent -ne 54174) {
        throw "Homologation ports do not match the fixed topology."
    }
    if ($config.database.host -ne "127.0.0.1" -or $config.database.name -ne "frota_hml") {
        throw "Homologation database endpoint is invalid."
    }
    foreach ($roleName in @([string]$config.database.applicationUser, [string]$config.database.superUser)) {
        if ($roleName -notmatch '^[a-z][a-z0-9_]{0,62}$') { throw "Unsafe PostgreSQL role name in homologation configuration." }
    }
    if ([string]::IsNullOrWhiteSpace([string]$config.database.applicationPassword) -or [string]::IsNullOrWhiteSpace([string]$config.database.superPassword)) {
        throw "Secure PostgreSQL credentials are missing from homologation configuration."
    }
    $backupRoots = @($config.productionBackupRoots)
    if ($backupRoots.Count -eq 0) { throw "At least one production backup root must be allowlisted." }
    foreach ($backupRoot in $backupRoots) {
        if (-not [IO.Path]::IsPathRooted([string]$backupRoot)) { throw "Every allowlisted backup root must be absolute." }
        if (Test-HmlPathWithin -Path $backupRoot -Root $script:HmlExpectedRoot) { throw "Production backup roots must be outside the homologation clone." }
    }
    if ([int]$config.refresh.minimumBackupAgeMinutes -lt 1 -or [int]$config.refresh.minimumBackupAgeMinutes -gt 60 -or
        [int]$config.refresh.maximumBackupAgeHours -lt 1 -or [int]$config.refresh.maximumBackupAgeHours -gt 168 -or
        [int]$config.refresh.stabilityCheckSeconds -lt 5 -or [int]$config.refresh.stabilityCheckSeconds -gt 60 -or
        [int]$config.refresh.retryMinutes -lt 5 -or [int]$config.refresh.retryMinutes -gt 60 -or
        [int]$config.refresh.cutoffHour -lt 4 -or [int]$config.refresh.cutoffHour -gt 12) {
        throw "Refresh timing configuration is outside the safe bounds."
    }
    return $config
}

function Read-HmlEnvFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    $result = [ordered]@{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
        $parts = $trimmed.Split("=", 2)
        if ($parts.Count -ne 2 -or $parts[0] -notmatch '^[A-Z][A-Z0-9_]*$') {
            throw "Invalid environment entry in '$Path'."
        }
        $result[$parts[0]] = $parts[1]
    }
    return $result
}

function Assert-HmlBackendEnvironment {
    param(
        [Parameter(Mandatory = $true)][Collections.IDictionary]$Values,
        [Parameter(Mandatory = $true)][object]$Config
    )

    foreach ($name in @("DATABASE_URL", "SECRET_KEY", "SIGNATURE_EVIDENCE_SECRET", "STORAGE_DIR", "CORS_ORIGINS", "CSRF_TRUSTED_ORIGINS", "COOKIE_NAME", "CSRF_COOKIE_NAME", "APP_ENV", "CERTIFICATE_SIGNING_ENABLED", "CANONICAL_DOCUMENT_ARTIFACTS_ENABLED", "SIGNATURE_AGENT_ENABLED", "HOMOLOGATION_CERTIFICATE_TARGETS_ONLY", "DIGITAL_DOCUMENT_ARTIFACTS_DIR")) {
        if (-not $Values.Contains($name) -or [string]::IsNullOrWhiteSpace([string]$Values[$name])) {
            throw "Required homologation setting is missing: $name"
        }
    }
    $uri = [Uri]$Values["DATABASE_URL"]
    if ($uri.Host -ne "127.0.0.1" -or $uri.Port -ne 5440 -or $uri.AbsolutePath -ne "/frota_hml") {
        throw "DATABASE_URL must point only to 127.0.0.1:5440/frota_hml."
    }
    Assert-HmlPathWithin -Path $Values["STORAGE_DIR"] -Root $script:HmlExpectedMount -Label "STORAGE_DIR"
    Assert-HmlPathWithin -Path $Values["DIGITAL_DOCUMENT_ARTIFACTS_DIR"] -Root $script:HmlExpectedMount -Label "DIGITAL_DOCUMENT_ARTIFACTS_DIR"
    if ($Values["APP_ENV"] -ne "homologation") { throw "APP_ENV must identify the isolated homologation environment." }
    if ($Values["CORS_ORIGINS"] -ne '["http://127.0.0.1:3010"]') { throw "CORS must be loopback-only on port 3010." }
    if ($Values["CSRF_TRUSTED_ORIGINS"] -ne '["http://127.0.0.1:3010"]') { throw "CSRF origins must be loopback-only on port 3010." }
    if (-not $Values["COOKIE_NAME"].StartsWith("frota_hml_") -or -not $Values["CSRF_COOKIE_NAME"].StartsWith("frota_hml_")) {
        throw "Cookie names must be exclusive to homologation."
    }
    if ($Values["COOKIE_NAME"] -eq $Values["CSRF_COOKIE_NAME"]) { throw "Auth and CSRF cookies must be distinct." }
    if ($Values["HOMOLOGATION_CERTIFICATE_TARGETS_ONLY"] -ne "true") { throw "Certificate signing must remain restricted to allowlisted homologation targets." }
}

function Get-HmlPortListener {
    param([Parameter(Mandatory = $true)][int]$Port)
    return Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Test-HmlPortListening {
    param([Parameter(Mandatory = $true)][int]$Port)
    return $null -ne (Get-HmlPortListener -Port $Port)
}

function Write-HmlPidRecord {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][string]$RuntimeRoot,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory
    )

    Assert-HmlPathWithin -Path $RuntimeRoot -Root $script:HmlExpectedMount -Label "Runtime directory"
    $record = [ordered]@{
        schemaVersion = 1
        name = $Name
        pid = $Process.Id
        executable = $Process.StartInfo.FileName
        workingDirectory = (Get-HmlNormalizedPath $WorkingDirectory)
        repositoryRoot = $script:HmlExpectedRoot
        startedAt = (Get-Date).ToUniversalTime().ToString("o")
    }
    $record | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $RuntimeRoot "$Name.pid.json") -Encoding UTF8
}

function Get-HmlOwnedProcess {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$RuntimeRoot
    )

    $pidPath = Join-Path $RuntimeRoot "$Name.pid.json"
    if (-not (Test-Path -LiteralPath $pidPath -PathType Leaf)) { return $null }
    try {
        $record = Get-Content -LiteralPath $pidPath -Raw | ConvertFrom-Json
        if ($record.schemaVersion -ne 1 -or $record.name -ne $Name -or $record.repositoryRoot -ne $script:HmlExpectedRoot) { return $null }
        Assert-HmlPathWithin -Path $record.workingDirectory -Root $script:HmlExpectedRoot -Label "Recorded working directory"
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($record.pid)" -ErrorAction Stop
        if (-not $process) { return $null }
        $commandLine = [string]$process.CommandLine
        $recordedExecutable = Get-HmlNormalizedPath -Path $record.executable
        $actualExecutable = Get-HmlNormalizedPath -Path $process.ExecutablePath
        if (-not $actualExecutable.Equals($recordedExecutable, [StringComparison]::OrdinalIgnoreCase)) { return $null }
        $ownedExecutable = Test-HmlPathWithin -Path $actualExecutable -Root $script:HmlExpectedRoot
        $ownedCommand = $commandLine.IndexOf($script:HmlExpectedRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0
        if (-not $ownedExecutable -and -not $ownedCommand) { return $null }
        return [pscustomobject]@{ Record = $record; Process = $process; PidPath = $pidPath }
    }
    catch {
        return $null
    }
}

function Stop-HmlOwnedProcess {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$RuntimeRoot
    )

    $owned = Get-HmlOwnedProcess -Name $Name -RuntimeRoot $RuntimeRoot
    if (-not $owned) {
        Write-Warning "No verifiable homologation process '$Name' was found; nothing was stopped."
        return $false
    }
    Stop-Process -Id $owned.Process.ProcessId -ErrorAction Stop
    try { Wait-Process -Id $owned.Process.ProcessId -Timeout 10 -ErrorAction Stop }
    catch {
        if (Get-Process -Id $owned.Process.ProcessId -ErrorAction SilentlyContinue) {
            throw "Verified homologation process '$Name' did not exit within 10 seconds."
        }
    }
    Remove-Item -LiteralPath $owned.PidPath -Force
    return $true
}

function Find-HmlPostgresBin {
    $psql = Get-Command psql.exe -ErrorAction SilentlyContinue
    if ($psql) { return Split-Path $psql.Source -Parent }

    $candidate = Get-ChildItem -LiteralPath "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName "bin" } |
        Where-Object { Test-Path -LiteralPath (Join-Path $_ "psql.exe") } |
        Select-Object -First 1
    if (-not $candidate) { throw "PostgreSQL client/server binaries were not found." }
    return $candidate
}

function Start-HmlPostgres {
    param([Parameter(Mandatory = $true)][object]$Config)

    if (Test-HmlPortListening -Port 5440) {
        if (-not (Test-HmlPostgresOwned)) {
            throw "Port 5440 is occupied by a process that is not the homologation PostgreSQL cluster."
        }
        return
    }
    $dataRoot = Join-Path $script:HmlExpectedMount "postgres-data"
    Assert-HmlPathWithin -Path $dataRoot -Root $script:HmlExpectedMount -Label "PostgreSQL data directory"
    if (-not (Test-Path -LiteralPath (Join-Path $dataRoot "PG_VERSION"))) {
        throw "The isolated PostgreSQL cluster has not been initialized. Run setup.ps1 first."
    }
    $pgCtl = Join-Path (Find-HmlPostgresBin) "pg_ctl.exe"
    & $pgCtl -D $dataRoot -o "-p 5440 -h 127.0.0.1" -w start
    if ($LASTEXITCODE -ne 0 -or -not (Test-HmlPortListening -Port 5440)) {
        throw "The isolated PostgreSQL server failed to start on 127.0.0.1:5440."
    }
}

function Test-HmlPostgresOwned {
    $listener = Get-HmlPortListener -Port 5440
    if (-not $listener) { return $false }
    $dataRoot = Join-Path $script:HmlExpectedMount "postgres-data"
    $postmasterPid = Join-Path $dataRoot "postmaster.pid"
    if (-not (Test-Path -LiteralPath $postmasterPid)) { return $false }
    try {
        $expectedPid = [int](Get-Content -LiteralPath $postmasterPid -TotalCount 1)
        return $listener.OwningProcess -eq $expectedPid
    }
    catch { return $false }
}

function Stop-HmlPostgres {
    if (-not (Test-HmlPortListening -Port 5440)) { return }
    $dataRoot = Join-Path $script:HmlExpectedMount "postgres-data"
    Assert-HmlPathWithin -Path $dataRoot -Root $script:HmlExpectedMount -Label "PostgreSQL data directory"
    $postmasterPid = Join-Path $dataRoot "postmaster.pid"
    if (-not (Test-Path -LiteralPath $postmasterPid)) {
        throw "Port 5440 is occupied, but no postmaster.pid exists in the homologation data directory. Refusing to stop it."
    }
    $expectedPid = [int](Get-Content -LiteralPath $postmasterPid -TotalCount 1)
    $listener = Get-HmlPortListener -Port 5440
    if ($listener.OwningProcess -ne $expectedPid) {
        throw "Port 5440 does not belong to the homologation PostgreSQL cluster. Refusing to stop it."
    }
    $pgCtl = Join-Path (Find-HmlPostgresBin) "pg_ctl.exe"
    & $pgCtl -D $dataRoot -m fast -w stop
    if ($LASTEXITCODE -ne 0) { throw "Unable to stop the homologation PostgreSQL cluster safely." }
}

function Test-HmlZipEntrySafe {
    param([Parameter(Mandatory = $true)][string]$EntryName)

    if ([string]::IsNullOrWhiteSpace($EntryName)) { return $false }
    $normalized = $EntryName.Replace('/', '\')
    if ([IO.Path]::IsPathRooted($normalized) -or $normalized.StartsWith("\") -or $normalized.Contains(":") -or $normalized.IndexOf([char]0) -ge 0) { return $false }
    foreach ($segment in $normalized.Split('\')) {
        if ($segment -eq "..") { return $false }
    }
    return $true
}

function Remove-HmlSafeTree {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$AllowedRoot
    )

    $candidate = Get-HmlNormalizedPath -Path $Path
    $root = Get-HmlNormalizedPath -Path $AllowedRoot
    if ($candidate.Equals($root, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove the allowed root itself: '$root'."
    }
    Assert-HmlPathWithin -Path $candidate -Root $root -Label "Removal target"
    if (Test-Path -LiteralPath $candidate) {
        Remove-Item -LiteralPath $candidate -Recurse -Force
    }
}

function Write-HmlAuditLog {
    param(
        [Parameter(Mandatory = $true)][string]$Event,
        [Parameter(Mandatory = $true)][hashtable]$Data
    )

    $logRoot = Join-Path $script:HmlExpectedMount "logs"
    if (-not (Test-Path -LiteralPath $logRoot)) { New-Item -ItemType Directory -Path $logRoot -Force | Out-Null }
    $record = [ordered]@{
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
        event = $Event
        data = $Data
    }
    ($record | ConvertTo-Json -Compress -Depth 6) | Add-Content -LiteralPath (Join-Path $logRoot "homologation-operations.jsonl") -Encoding UTF8
}
