param(
    [Parameter(Mandatory = $true)][string]$ScriptPath,
    [string]$ProgId = 'InDesign.Application',
    [switch]$AllowLaunch
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$indesignApp = $null
try {
    if ($ProgId -notmatch '^InDesign\.Application(?:\.\d+)?$') {
        throw 'Invalid InDesign ProgID.'
    }
    try {
        $indesignApp = [Runtime.InteropServices.Marshal]::GetActiveObject($ProgId)
    } catch {
        if (-not $AllowLaunch) {
            throw "Cannot attach to $ProgId. Open the matching InDesign version, or set INDESIGN_ALLOW_LAUNCH=1."
        }
        $indesignApp = New-Object -ComObject $ProgId
    }
    $jsxSource = [IO.File]::ReadAllText($ScriptPath, [Text.Encoding]::UTF8)
    # Adobe ScriptLanguage.JAVASCRIPT = 1246973031.
    $null = $indesignApp.DoScript($jsxSource, 1246973031)
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
} finally {
    if ($null -ne $indesignApp -and [Runtime.InteropServices.Marshal]::IsComObject($indesignApp)) {
        $null = [Runtime.InteropServices.Marshal]::ReleaseComObject($indesignApp)
    }
}
