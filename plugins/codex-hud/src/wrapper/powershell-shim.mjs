import os from "node:os";
import path from "node:path";

export const SHIM_START = "# >>> codex-hud wrapper >>>";
export const SHIM_END = "# <<< codex-hud wrapper <<<";

export function renderPowerShellShim(options = {}) {
  const repoRoot = normalizeRequiredPath(options.repoRoot, "repoRoot");
  const nodeCommand = options.nodeCommand || "node";
  const scriptRelativePath = options.scriptRelativePath || "plugins\\codex-hud\\scripts\\codex-hud.mjs";
  const escapedRepoRoot = escapePowerShellSingleQuotedString(repoRoot);
  const escapedNodeCommand = escapePowerShellSingleQuotedString(nodeCommand);
  const escapedScriptRelativePath = escapePowerShellSingleQuotedString(scriptRelativePath);

  return `${SHIM_START}
# Managed by Codex HUD. Edit with: npm run codex-hud:install:powershell -- --uninstall
$script:CodexHudRepoRoot = '${escapedRepoRoot}'
$script:CodexHudNodeCommand = '${escapedNodeCommand}'
$script:CodexHudScriptRelativePath = '${escapedScriptRelativePath}'

if (Get-Command codex -CommandType Function -ErrorAction SilentlyContinue) {
  Remove-Item Function:\codex -ErrorAction SilentlyContinue
}

function script:ResolveCodexHudRawCodex {
  Get-Command codex -CommandType ExternalScript,Application -ErrorAction Stop | Select-Object -First 1
}

function script:ResolveCodexHudPowerShellBin {
  $currentProcess = Get-Process -Id $PID -ErrorAction SilentlyContinue
  if ($currentProcess -and $currentProcess.Path -and (Test-Path -LiteralPath $currentProcess.Path)) {
    return $currentProcess.Path
  }

  $pwshPath = Join-Path $PSHOME 'pwsh.exe'
  if (Test-Path -LiteralPath $pwshPath) {
    return $pwshPath
  }

  $windowsPowerShellPath = Join-Path $PSHOME 'powershell.exe'
  if (Test-Path -LiteralPath $windowsPowerShellPath) {
    return $windowsPowerShellPath
  }

  return $null
}

function script:InvokeCodexHudWrapper {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CodexHudArgs)

  $codexHudScript = Join-Path $script:CodexHudRepoRoot $script:CodexHudScriptRelativePath
  if (-not (Test-Path -LiteralPath $codexHudScript)) {
    Write-Error "Codex HUD wrapper not found: $codexHudScript"
    return
  }

  $rawCodex = script:ResolveCodexHudRawCodex
  $powerShellBin = script:ResolveCodexHudPowerShellBin
  $previousCodexHudCodexBin = $env:CODEX_HUD_CODEX_BIN
  $previousCodexHudPowerShellBin = $env:CODEX_HUD_POWERSHELL_BIN
  try {
    $env:CODEX_HUD_CODEX_BIN = $rawCodex.Source
    if ($powerShellBin) {
      $env:CODEX_HUD_POWERSHELL_BIN = $powerShellBin
    }
    & $script:CodexHudNodeCommand $codexHudScript @CodexHudArgs
  } finally {
    if ($null -eq $previousCodexHudCodexBin) {
      Remove-Item Env:\CODEX_HUD_CODEX_BIN -ErrorAction SilentlyContinue
    } else {
      $env:CODEX_HUD_CODEX_BIN = $previousCodexHudCodexBin
    }
    if ($null -eq $previousCodexHudPowerShellBin) {
      Remove-Item Env:\CODEX_HUD_POWERSHELL_BIN -ErrorAction SilentlyContinue
    } else {
      $env:CODEX_HUD_POWERSHELL_BIN = $previousCodexHudPowerShellBin
    }
  }
}

function global:codex-hub {
  script:InvokeCodexHudWrapper @args
}

function global:codex-hud {
  script:InvokeCodexHudWrapper @args
}

function global:codex-raw {
  $rawCodex = script:ResolveCodexHudRawCodex
  & $rawCodex.Source @args
}

function script:ShowCodexHudDoctor {
  $codexHudScript = Join-Path $script:CodexHudRepoRoot $script:CodexHudScriptRelativePath
  $codexHudHome = if ($env:CODEX_HUD_HOME) { $env:CODEX_HUD_HOME } elseif ($env:HUD_HOME) { $env:HUD_HOME } elseif ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'codex-hud' } else { Join-Path $HOME '.codex-hud' }
  $powerShellBin = script:ResolveCodexHudPowerShellBin
  $nodeCommand = Get-Command $script:CodexHudNodeCommand -ErrorAction SilentlyContinue | Select-Object -First 1
  $rawCodex = Get-Command codex -CommandType ExternalScript,Application -ErrorAction SilentlyContinue | Select-Object -First 1

  Write-Output "Codex HUD global command diagnostics"
  Write-Output "repo: $script:CodexHudRepoRoot"
  Write-Output "wrapper: $codexHudScript"
  Write-Output "wrapper exists: $(Test-Path -LiteralPath $codexHudScript)"
  Write-Output "hud home: $codexHudHome"
  Write-Output "hud home exists: $(Test-Path -LiteralPath $codexHudHome)"
  Write-Output "node: $($nodeCommand.Source)"
  Write-Output "powershell: $powerShellBin"
  Write-Output "raw codex: $($rawCodex.Source)"
  Write-Output "codex command resolution:"
  Get-Command codex -All | Select-Object CommandType,Source,Name | Format-Table -AutoSize
}

function global:codex-hub-doctor {
  script:ShowCodexHudDoctor
}

function global:codex-hud-doctor {
  script:ShowCodexHudDoctor
}
${SHIM_END}`;
}

export function upsertPowerShellShim(profileContents, shimBlock) {
  const normalizedContents = profileContents || "";
  const existingRange = findShimRange(normalizedContents);
  const blockWithNewlines = `${shimBlock.trim()}\n`;

  if (!existingRange) {
    const separator = normalizedContents.endsWith("\n") || normalizedContents.length === 0 ? "" : "\n";
    return `${normalizedContents}${separator}${blockWithNewlines}`;
  }

  return `${normalizedContents.slice(0, existingRange.start)}${blockWithNewlines}${normalizedContents.slice(existingRange.end)}`;
}

export function removePowerShellShim(profileContents) {
  const normalizedContents = profileContents || "";
  const existingRange = findShimRange(normalizedContents);
  if (!existingRange) return normalizedContents;
  return `${normalizedContents.slice(0, existingRange.start)}${normalizedContents.slice(existingRange.end)}`;
}

export function resolvePowerShellProfilePath(options = {}) {
  return resolvePowerShellProfilePaths(options)[0];
}

export function resolvePowerShellProfilePaths(options = {}) {
  if (options.profilePath) {
    return [path.resolve(options.profilePath)];
  }

  const env = options.env || process.env;
  if (env.CODEX_HUD_POWERSHELL_PROFILE) {
    return [path.resolve(env.CODEX_HUD_POWERSHELL_PROFILE)];
  }

  const home = env.USERPROFILE || env.HOME || os.homedir();
  const scope = options.scope || "current-host";
  const profilePaths = {
    powershellAllHosts: path.join(home, "Documents", "PowerShell", "profile.ps1"),
    powershellCurrentHost: path.join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1"),
    windowsPowerShellAllHosts: path.join(home, "Documents", "WindowsPowerShell", "profile.ps1"),
    windowsPowerShellCurrentHost: path.join(home, "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1"),
  };

  if (scope === "current-host") {
    return [profilePaths.powershellCurrentHost];
  }

  if (scope === "all-hosts") {
    return [profilePaths.powershellAllHosts, profilePaths.windowsPowerShellAllHosts];
  }

  if (scope === "global" || scope === "both") {
    return [
      profilePaths.powershellAllHosts,
      profilePaths.powershellCurrentHost,
      profilePaths.windowsPowerShellAllHosts,
      profilePaths.windowsPowerShellCurrentHost,
    ];
  }

  throw new Error("--scope must be one of: current-host, all-hosts, global");
}

function findShimRange(contents) {
  const start = contents.indexOf(SHIM_START);
  if (start === -1) return undefined;

  const endMarkerIndex = contents.indexOf(SHIM_END, start);
  if (endMarkerIndex === -1) {
    throw new Error("PowerShell profile contains an unterminated Codex HUD shim block");
  }

  let end = endMarkerIndex + SHIM_END.length;
  if (contents[end] === "\r" && contents[end + 1] === "\n") {
    end += 2;
  } else if (contents[end] === "\n") {
    end += 1;
  }

  return { start, end };
}

function normalizeRequiredPath(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required`);
  }

  return path.resolve(value);
}

function escapePowerShellSingleQuotedString(value) {
  return String(value).replaceAll("'", "''");
}
