import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const script = resolve(import.meta.dirname, '../scripts/deploy-botcrm.sh');

test('BotCRM runner deploy accepts only an approved mainline tag and preserves local work', () => {
  const root = mkdtempSync(join(tmpdir(), 'botcrm-deploy-test-'));
  const remote = join(root, 'remote.git');
  const author = join(root, 'author');
  const target = join(root, 'production');
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const deploy = (version, commit) => spawnSync('sh', [script, version, commit], { encoding: 'utf8', env: { ...process.env, BOTCRM_DEPLOY_ROOT: target, NODE_BIN: process.execPath } });
  try {
    git(root, 'init', '--bare', remote);
    git(root, 'clone', remote, author);
    git(author, 'config', 'user.name', 'Deploy Test');
    git(author, 'config', 'user.email', 'deploy-test@example.invalid');
    git(author, 'switch', '-c', 'main');
    mkdirSync(join(author, 'infra/scripts'), { recursive: true });
    writeFileSync(join(author, 'infra/scripts/deploy.mjs'), 'console.log("approved_deploy:" + process.argv[2]);\n');
    writeFileSync(join(author, '.gitignore'), '.env.production\n');
    git(author, 'add', '.'); git(author, 'commit', '-m', 'initial'); git(author, 'push', 'origin', 'main');
    git(remote, 'symbolic-ref', 'HEAD', 'refs/heads/main');
    git(root, 'clone', remote, target);
    writeFileSync(join(target, '.env.production'), 'TEST_ONLY=true\n', { mode: 0o600 });
    const original = git(target, 'rev-parse', 'HEAD');
    writeFileSync(join(author, 'release.txt'), '0.7.0\n');
    git(author, 'add', '.'); git(author, 'commit', '-m', 'release');
    const approved = git(author, 'rev-parse', 'HEAD');
    git(author, 'tag', 'v0.7.0'); git(author, 'push', 'origin', 'main', 'v0.7.0');

    assert.notEqual(deploy('0.7.0; touch injected', approved).status, 0);
    assert.notEqual(deploy('0.7.0', 'not-a-commit').status, 0);
    assert.notEqual(deploy('0.7.0', original).status, 0, 'tag must match the approved SHA');
    assert.equal(git(target, 'rev-parse', 'HEAD'), original);
    writeFileSync(join(target, 'local-work.txt'), 'keep this');
    assert.notEqual(deploy('0.7.0', approved).status, 0, 'untracked local work must stop deployment');
    assert.equal(git(target, 'rev-parse', 'HEAD'), original);
    rmSync(join(target, 'local-work.txt'));
    const result = deploy('0.7.0', approved);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`approved_deploy:${approved.slice(0, 12)}`));
    assert.equal(git(target, 'rev-parse', 'HEAD'), approved);

    git(author, 'switch', '-c', 'unmerged');
    writeFileSync(join(author, 'unreviewed.txt'), 'not on main');
    git(author, 'add', '.'); git(author, 'commit', '-m', 'unmerged');
    const unmerged = git(author, 'rev-parse', 'HEAD');
    git(author, 'tag', 'v0.8.0'); git(author, 'push', 'origin', 'v0.8.0');
    assert.notEqual(deploy('0.8.0', unmerged).status, 0, 'a tag outside main must not deploy');
    assert.equal(git(target, 'rev-parse', 'HEAD'), approved);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
