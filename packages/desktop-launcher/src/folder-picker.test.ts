import { describe, expect, it } from 'vitest';
import { macFolderPickerCommand, windowsFolderPickerCommand } from './folder-picker.js';

describe('folder picker command shape', () => {
  it('builds a Windows PowerShell command that opens a native FolderBrowserDialog', () => {
    const { command, args } = windowsFolderPickerCommand();
    expect(command).toBe('powershell');
    expect(args.join(' ')).toContain('FolderBrowserDialog');
    expect(args.join(' ')).toContain('ShowDialog');
  });

  it('builds a macOS osascript command that opens a native folder chooser', () => {
    const { command, args } = macFolderPickerCommand();
    expect(command).toBe('osascript');
    expect(args.join(' ')).toContain('choose folder');
  });
});
