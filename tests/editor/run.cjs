const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests,
} = require('@vscode/test-electron');

async function runProfile(vscodeExecutablePath, theme) {
  const profile = theme === 'Default High Contrast' ? 'high-contrast' : 'dark';
  // macOS Unix sockets cannot use the checkout's long profile paths.
  const root = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), 'ie-editor-'));
  const reports = path.resolve('reports', profile);
  const userData = path.join(root, 'user'),
    extensions = path.join(root, 'extensions'),
    workspace = path.join(root, 'workspace');
  for (const directory of [userData, extensions, workspace])
    fs.mkdirSync(directory, { recursive: true });
  fs.mkdirSync(path.join(userData, 'User'), { recursive: true });
  fs.writeFileSync(
    path.join(userData, 'User/settings.json'),
    JSON.stringify({
      'security.workspace.trust.enabled': false,
      'update.mode': 'none',
      'extensions.autoUpdate': false,
      'telemetry.telemetryLevel': 'off',
      'workbench.startupEditor': 'none',
      'window.titleBarStyle': 'custom',
      // Configure before startup: live accessibility changes can terminate the test host.
      'workbench.colorTheme': theme,
      'editor.accessibilitySupport': 'on',
      'workbench.reduceMotion': 'on',
    }),
  );
  const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
  const result = spawnSync(
    cli,
    [
      ...args,
      '--user-data-dir',
      userData,
      '--extensions-dir',
      extensions,
      '--install-extension',
      path.resolve(process.env.VSIX_PATH),
      '--force',
    ],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (result.status !== 0) throw new Error(`VSIX installation failed: ${result.status}`);
  try {
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath: path.resolve('tests/editor/harness'),
      extensionTestsPath: path.resolve('tests/editor/suite.cjs'),
      launchArgs: [
        workspace,
        '--user-data-dir',
        userData,
        '--extensions-dir',
        extensions,
        '--skip-welcome',
        '--skip-release-notes',
        '--disable-workspace-trust',
      ],
      extensionTestsEnv: {
        IE_TEST_EXTENSIONS: extensions,
        IE_TEST_WORKSPACE: workspace,
        PACKAGE_CHANNEL: process.env.PACKAGE_CHANNEL,
        IE_TEST_REPORTS: reports,
        IE_TEST_THEME: theme,
      },
    });
    const report = JSON.parse(fs.readFileSync(path.join(reports, 'editor.json'), 'utf8'));
    const expected = require('../feature-inventory.json').cases.map(c => c.id);
    if (JSON.stringify(report.cases.map(c => c.id)) !== JSON.stringify(expected) || report.cases.some(c => c.status !== 'passed')) {
      throw new Error('Editor exited without completing the feature inventory');
    }
  } finally {
    const logs = path.join(userData, 'logs');
    if (fs.existsSync(logs)) fs.cpSync(logs, path.join(reports, 'logs'), { recursive: true });
  }
}
async function main() {
  const version = process.env.VSCODE_VERSION ?? '1.100.0';
  const vscodeExecutablePath = await downloadAndUnzipVSCode(version);
  for (const theme of ['Default High Contrast', 'Default Dark Modern']) {
    await runProfile(vscodeExecutablePath, theme);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
