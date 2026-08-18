import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';

export function windowsFolderPickerCommand(): { command: string; args: string[] } {
  const script = "Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = 'Choose the project folder you want YCF to open'; if ($dialog.ShowDialog() -eq 'OK') { Write-Output $dialog.SelectedPath }";
  return { command: 'powershell', args: ['-NoProfile', '-NonInteractive', '-Command', script] };
}

export function macFolderPickerCommand(): { command: string; args: string[] } {
  const script = 'try\n  POSIX path of (choose folder with prompt "Choose the project folder you want YCF to open")\non error\n  ""\nend try';
  return { command: 'osascript', args: ['-e', script] };
}

/** Opens the operating system's own folder picker. Returns null if the user cancels. */
export function pickProjectFolder(): string | null {
  const { command, args } = platform() === 'win32' ? windowsFolderPickerCommand() : macFolderPickerCommand();
  const output = execFileSync(command, args, { encoding: 'utf8' }).trim();
  return output.length > 0 ? output : null;
}
