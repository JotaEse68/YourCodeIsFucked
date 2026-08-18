# YCF one-line installer for Windows.
#   irm https://raw.githubusercontent.com/JotaEse68/YourCodeIsFucked/main/install.ps1 | iex
$ErrorActionPreference = 'Stop'
$minNodeMajor = 22

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host ""
    Write-Host "YCF needs Node.js $minNodeMajor or newer, and it's not installed on this machine."
    Write-Host "Install it from https://nodejs.org (the LTS button is fine), then run this again:"
    Write-Host ""
    Write-Host "  irm https://raw.githubusercontent.com/JotaEse68/YourCodeIsFucked/main/install.ps1 | iex"
    Write-Host ""
    exit 1
}

$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt $minNodeMajor) {
    Write-Host ""
    Write-Host "YCF needs Node.js $minNodeMajor or newer. You have $(node -v)."
    Write-Host "Update it from https://nodejs.org, then run this again."
    Write-Host ""
    exit 1
}

Write-Host "Installing YCF..."
npm install -g @jotaese68/ycf

Write-Host ""
Write-Host "YCF is installed. Now:"
Write-Host "  1. Open PowerShell in your project folder (cd into it, or Shift+Right-click the"
Write-Host "     folder in File Explorer and choose 'Open PowerShell window here')."
Write-Host "  2. Run: ycf cockpit"
Write-Host ""
Write-Host "That opens a visual dashboard in your browser -- no config needed."
Write-Host ""
