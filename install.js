#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

const SKILL_NAME = 'remote';
const SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills');
const TARGET = path.join(SKILLS_DIR, SKILL_NAME);
const SOURCE = path.join(__dirname, 'skill');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function removeIfExists(p) {
  if (fs.existsSync(p)) {
    const stat = fs.lstatSync(p);
    if (stat.isSymbolicLink() || stat.isFile()) {
      fs.unlinkSync(p);
    } else {
      fs.rmSync(p, { recursive: true });
    }
  }
}

function install() {
  // ~/.claude/skills must exist for Claude Code to pick up skills
  ensureDir(SKILLS_DIR);

  // Remove any previous install
  removeIfExists(TARGET);

  // Symlink: ~/.claude/skills/remote → <package>/skill/
  fs.symlinkSync(SOURCE, TARGET);

  console.log(`\nremote-boy installed ✓`);
  console.log(`  Skill linked to: ${TARGET}`);
  console.log(`  Run /remote setup in Claude Code to configure.\n`);
}

try {
  install();
} catch (err) {
  // Non-fatal: user may not have Claude Code installed yet, or may be in CI
  console.warn(`\nremote-boy: could not install skill automatically.`);
  console.warn(`  Reason: ${err.message}`);
  console.warn(`  Manual install: ln -s "${SOURCE}" "${TARGET}"\n`);
}
