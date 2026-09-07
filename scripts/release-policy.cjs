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
module.exports = { validateRelease };
if (require.main === module) {
  validateRelease(
    process.env.RELEASE_TYPE,
    process.env.TAG_NAME,
    fs.readFileSync('VERSION', 'utf8').trim(),
  );
}
