const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  validHeader,
  validateLabels,
  validateVersions,
  validateWorkflows,
  validateVerificationGraph,
} = require('./policy.cjs');
const { validateRelease, parseDryRun, validateChangelog } = require('./release-policy.cjs');

test('commit policy enforces types, syntax, and 100-character limit', () => {
  for (const header of [
    'feat(api)!: update schema',
    'ci: verify packages',
    `fix: ${'a'.repeat(95)}`,
  ])
    assert.ok(validHeader(header));
  for (const header of ['wip: work', 'fix:', 'fix: ' + 'a'.repeat(96), 'fix: ok\nextra'])
    assert.equal(validHeader(header), false);
});
test('labels reject missing definitions, duplicates, and malformed colors', () => {
  const labels = [{ name: 'documentation', color: 'abcdef', description: 'Docs' }];
  validateLabels(labels, { documentation: [] });
  assert.throws(() => validateLabels(labels, { unknown: [] }));
  assert.throws(() => validateLabels([...labels, ...labels], {}));
  assert.throws(() => validateLabels([{ ...labels[0], color: 'red' }], {}));
});
test('CodeQL pins and privileged checkout boundaries are enforced', () => {
  const workflow = {
    on: { pull_request_target: {} },
    permissions: {},
    jobs: {
      test: {
        'timeout-minutes': 5,
        steps: [{ uses: `github/codeql-action/init@${'a'.repeat(40)}` }],
      },
    },
  };
  validateWorkflows([['test', workflow]]);
  const mismatched = structuredClone(workflow);
  mismatched.jobs.test.steps.push({ uses: `github/codeql-action/analyze@${'b'.repeat(40)}` });
  assert.throws(() => validateWorkflows([['test', mismatched]]));
  const unsafe = structuredClone(workflow);
  unsafe.jobs.test.steps.push({ uses: `actions/checkout@${'a'.repeat(40)}` });
  assert.throws(() => validateWorkflows([['test', unsafe]]));
});
test('version validation catches stale workspace, lockfile, changelog, and editor baseline', () => {
  const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
  const pkg = read('package.json'),
    lock = read('package-lock.json');
  const workspaces = pkg.workspaces.map((directory) => ({
    directory,
    manifest: read(`${directory}/package.json`),
  }));
  const version = fs.readFileSync('VERSION', 'utf8').trim(),
    changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
  validateVersions(version, pkg, lock, workspaces, changelog);
  assert.throws(() => validateVersions('0.0.1', pkg, lock, workspaces, changelog));
  assert.throws(() => validateVersions(version, pkg, lock, workspaces, '## [0.0.1]'));
  const changed = structuredClone(pkg);
  changed.devDependencies['@types/vscode'] = '1.134.0';
  assert.throws(() => validateVersions(version, changed, lock, workspaces, changelog));
});
test('verification has one owner and an unconditional aggregate gate', () => {
  const yaml = require('js-yaml');
  const workflows = fs
    .readdirSync('.github/workflows')
    .filter((f) => f.endsWith('.yml'))
    .map((f) => [f, yaml.load(fs.readFileSync(`.github/workflows/${f}`, 'utf8'))]);
  validateVerificationGraph(workflows);
  const change = (edit) => {
    const copy = structuredClone(workflows);
    edit(Object.fromEntries(copy));
    return copy;
  };
  assert.throws(() =>
    validateVerificationGraph(
      change((w) => {
        w['ci.yml'].jobs.verify.if = 'success()';
      }),
    ),
  );
  assert.throws(() =>
    validateVerificationGraph(
      change((w) => {
        w['verify.yml'].on.push = {};
      }),
    ),
  );
  assert.throws(() =>
    validateVerificationGraph(
      change((w) => {
        w['maintenance.yml'].on.pull_request = {};
      }),
    ),
  );
  assert.throws(() =>
    validateVerificationGraph([
      ...workflows,
      ['duplicate.yml', { jobs: { test: { steps: [{ run: 'npm run test:editor' }] } } }],
    ]),
  );
  assert.throws(() =>
    validateVerificationGraph(
      change((w) => {
        delete w['verify.yml'].jobs.responsiveness;
      }),
    ),
  );
  const duplicate = structuredClone(workflows);
  duplicate.push(['another.yml', duplicate[0][1]]);
  assert.throws(() => validateWorkflows(duplicate), /duplicate workflow name/u);
});
test('release validation rejects version, syntax, and channel mismatches', () => {
  validateRelease('stable', 'v0.6.0', '0.6.0');
  validateRelease('prerelease', 'v0.5.2-pre.1', '0.5.2');
  for (const [type, tag, version] of [
    ['stable', 'v0.5.2', '0.5.2'],
    ['stable', 'v0.6.1', '0.6.0'],
    ['prerelease', 'v0.6.0-rc.1', '0.6.0'],
    ['prerelease', 'v0.5.2', '0.5.2'],
    ['other', 'v0.5.2', '0.5.2'],
  ])
    assert.throws(() => validateRelease(type, tag, version));
});

const releaseRepository = 'https://github.com/4Luke4/ie-lua-language-server';
function releaseChangelog({
  version = '0.6.0',
  date = '2026-09-07',
  link = `${releaseRepository}/compare/v0.5.0-alpha.5...v0.6.0`,
} = {}) {
  return `# Changelog\n\n## [${version}] - ${date}\n\n### Fixed\n\n- A release fix.\n\n[${version}]: ${link}\n`;
}

test('release dry-run input is explicit and defaults to publication checks', () => {
  assert.equal(parseDryRun(undefined), false);
  assert.equal(parseDryRun('false'), false);
  assert.equal(parseDryRun('true'), true);
  for (const value of ['', 'TRUE', 'False', '1', ' true ', true, false, null]) {
    assert.throws(() => parseDryRun(value), /Invalid DRY_RUN/u);
  }
  const yaml = require('js-yaml');
  const workflow = yaml.load(fs.readFileSync('.github/workflows/release.yml', 'utf8'));
  const check = workflow.jobs.validate.steps.find((step) => step.run === 'npm run release:check');
  assert.equal(check.env.DRY_RUN, '${{ inputs.dry_run }}');
  assert.ok(workflow.jobs.verify.needs.includes('validate'));
  assert.ok(workflow.jobs.release.needs.includes('validate'));
});

test('unreleased changelogs allow preparation dry runs but block publication', () => {
  const changelog = releaseChangelog({ date: 'Unreleased', link: `${releaseRepository}/pull/65` });
  assert.deepEqual(validateChangelog(changelog, '0.6.0', 'v0.6.0', true), { finalized: false });
  for (const dryRun of [false, undefined]) {
    assert.throws(
      () => validateChangelog(changelog, '0.6.0', 'v0.6.0', dryRun),
      /Publication requires a dated changelog/u,
    );
  }
  assert.throws(() => validateChangelog(changelog, '0.6.0', 'v0.6.0', 'false'), /boolean/u);
});

test('finalized stable and prerelease changelogs pass both release modes', () => {
  for (const [version, tag] of [
    ['0.6.0', 'v0.6.0'],
    ['0.5.4', 'v0.5.4-rc.1'],
  ]) {
    const changelog = releaseChangelog({
      version,
      date: '2024-02-29',
      link: `${releaseRepository}/compare/v0.5.0-alpha.5...${tag}`,
    });
    for (const dryRun of [true, false]) {
      assert.deepEqual(validateChangelog(changelog, version, tag, dryRun), { finalized: true });
      assert.deepEqual(
        validateChangelog(changelog.replaceAll('\n', '\r\n'), version, tag, dryRun),
        {
          finalized: true,
        },
      );
    }
  }
});

test('release changelog rejects invalid dates in both release modes', () => {
  for (const date of ['', 'unreleased', '2026-9-07', '2026-02-29', '2026-04-31', '2026-13-01']) {
    for (const dryRun of [true, false]) {
      assert.throws(
        () => validateChangelog(releaseChangelog({ date }), '0.6.0', 'v0.6.0', dryRun),
        /Changelog date/u,
      );
    }
  }
});

test('release changelog requires a unique latest version and corresponding link', () => {
  const valid = releaseChangelog();
  for (const changelog of [
    '# Changelog\n',
    releaseChangelog({ version: '0.5.3' }),
    `## [0.6.1] - Unreleased\n${valid}`,
    `${valid}\n## [0.6.0] - Unreleased\n`,
    valid.replace(/^\[0\.6\.0\]:.*$/mu, ''),
    `${valid}\n[0.6.0]: ${releaseRepository}/pull/65\n`,
    valid.replace('[0.6.0]:', '[v0.6.0]:'),
    releaseChangelog({ link: '' }),
  ]) {
    for (const dryRun of [true, false]) {
      assert.throws(() => validateChangelog(changelog, '0.6.0', 'v0.6.0', dryRun));
    }
  }
  const unreleased = releaseChangelog({ date: 'Unreleased' });
  assert.throws(() =>
    validateChangelog(unreleased.replace(/^\[0\.6\.0\]:.*$/mu, ''), '0.6.0', 'v0.6.0', true),
  );
});

test('finalized release links must compare this repository to the exact requested tag', () => {
  for (const link of [
    `${releaseRepository}/pull/65`,
    `${releaseRepository}/releases/tag/v0.6.0`,
    `${releaseRepository}/compare/v0.5.0-alpha.5...v0.6.1`,
    `${releaseRepository}/compare/v0.5.0-alpha.5...v0.6.0-rc.1`,
    `${releaseRepository}/compare/v0.5.0-alpha.5...v0.6.0?expand=1`,
    `${releaseRepository}/compare/...v0.6.0`,
    'https://github.com/another/repository/compare/v0.5.0...v0.6.0',
  ]) {
    for (const dryRun of [true, false]) {
      assert.throws(() => validateChangelog(releaseChangelog({ link }), '0.6.0', 'v0.6.0', dryRun));
    }
  }
  assert.throws(
    () =>
      validateChangelog(
        releaseChangelog({
          version: '0.5.4',
          link: `${releaseRepository}/compare/v0.5.0-alpha.5...v0.5.4-rc.1`,
        }),
        '0.5.4',
        'v0.5.4-rc.2',
        true,
      ),
    /requested release tag/u,
  );
});
