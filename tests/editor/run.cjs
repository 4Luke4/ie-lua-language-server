const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests,
} = require('@vscode/test-electron');

async function runProfile(version, vscodeExecutablePath, theme) {
  const profile = theme === 'Default High Contrast' ? 'high-contrast' : 'dark';
  const root = path.resolve(
    '.vscode-test',
    `profile-${version}-${process.env.PACKAGE_CHANNEL}-${profile}`,
  );
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
      IE_TEST_REPORTS: path.resolve('reports', profile),
      IE_TEST_THEME: theme,
    },
  });
}
async function main() {
  const version = process.env.VSCODE_VERSION ?? '1.100.0';
  const vscodeExecutablePath = await downloadAndUnzipVSCode(version);
  for (const theme of ['Default High Contrast', 'Default Dark Modern']) {
    await runProfile(version, vscodeExecutablePath, theme);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
