const fs = require('node:fs');
const assert = require('node:assert/strict');
const semver = require('semver');

function validateRelease(type, tag, version) {
  assert.equal(semver.valid(version), version, 'VERSION must be numeric semver');
  assert.match(version, /^\d+\.\d+\.\d+$/u);
  const suffix = type === 'stable' ? '' : '-(alpha|beta|rc|pre|preview)\\.(0|[1-9][0-9]*)';
  assert.ok(['stable', 'prerelease'].includes(type), 'Unknown release type');
  assert.match(
    tag,
    new RegExp(`^v${version.replaceAll('.', '\\.')}${suffix}$`, 'u'),
    'Tag must match VERSION and channel',
  );
  assert.equal(semver.minor(version) % 2, type === 'stable' ? 0 : 1, 'Incorrect odd/even channel');
  return { type, tag, version };
}
function parseDryRun(value) {
  // Direct invocation must enforce publication readiness unless explicitly a dry run.
  assert.ok(value === undefined || value === 'true' || value === 'false', 'Invalid DRY_RUN');
  return value === 'true';
}

function validateChangelog(changelog, version, tag, dryRun = false) {
  assert.equal(typeof dryRun, 'boolean', 'dryRun must be a boolean');
  const entries = [...changelog.matchAll(/^## \[(v?(\d+\.\d+\.\d+))\]([^\r\n]*)/gmu)];
  assert.equal(entries[0]?.[2], version, 'Latest changelog entry must match VERSION');
  assert.equal(
    entries.filter((entry) => entry[2] === version).length,
    1,
    'Expected one changelog entry for VERSION',
  );
  const definitions = [
    ...changelog.matchAll(/^\[(v?(\d+\.\d+\.\d+))\]:[^\S\r\n]*(.*)$/gmu),
  ].filter((definition) => definition[2] === version);
  assert.equal(definitions.length, 1, 'Expected one changelog link for VERSION');
  assert.equal(definitions[0][1], entries[0][1], 'Changelog link label must match its heading');
  const link = definitions[0][3].trim();
  assert.ok(link.length > 0, 'Changelog link must not be empty');
  const status = entries[0][3].trim();
  if (status === '- Unreleased') {
    assert.ok(dryRun, 'Publication requires a dated changelog entry and final comparison link');
    return { finalized: false };
  }

  assert.match(status, /^- \d{4}-\d{2}-\d{2}$/u, 'Changelog date must use YYYY-MM-DD');
  const date = status.slice(2);
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  assert.ok(
    Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date,
    'Changelog date must be a real calendar date',
  );
  // The target tag is intentionally absent until publication creates it.
  const comparison = link.match(
    /^https:\/\/github\.com\/4Luke4\/ie-lua-language-server\/compare\/([^\s?#]+)\.\.\.([^\s/?#]+)$/u,
  );
  assert.ok(comparison, 'Finalized changelog link must be a repository comparison');
  assert.equal(comparison[2], tag, 'Changelog comparison must end in the requested release tag');
  return { finalized: true };
}

module.exports = { validateRelease, parseDryRun, validateChangelog };
if (require.main === module) {
  const { version, tag } = validateRelease(
    process.env.RELEASE_TYPE,
    process.env.TAG_NAME,
    fs.readFileSync('VERSION', 'utf8').trim(),
  );
  const { finalized } = validateChangelog(
    fs.readFileSync('CHANGELOG.md', 'utf8'),
    version,
    tag,
    parseDryRun(process.env.DRY_RUN),
  );
  if (!finalized) {
    console.warn(
      '::warning::Preparation dry run only: commit the release date and final comparison link, then rerun verification before publication.',
    );
  }
}
