#!/usr/bin/env node

/**
 * CLI companion for remote-boy.
 * Not needed for normal use — /remote in Claude Code handles everything.
 * Useful for: install check, config path inspection, manual uninstall.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG  = path.join(os.homedir(), '.remote-boy', 'config.json');
const TUNNELS = path.join(os.homedir(), '.remote-boy', 'tunnels.json');
const SKILL   = path.join(os.homedir(), '.claude', 'skills', 'remote');

const cmd = process.argv[2];

switch (cmd) {
  case 'check':
  case undefined: {
    const skillInstalled = fs.existsSync(SKILL);
    const configExists   = fs.existsSync(CONFIG);
    const tunnelsExists  = fs.existsSync(TUNNELS);
    console.log('\nremote-boy status\n');
    console.log(`  skill installed : ${skillInstalled ? '✓' : '✗  run: npm install -g remote-boy'}`);
    console.log(`  config          : ${configExists ? CONFIG : '✗  run /remote setup in Claude Code'}`);
    console.log(`  tunnels state   : ${tunnelsExists ? TUNNELS : '(will be created on first /remote up)'}`);
    if (configExists) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
      if (cfg.credentials_file) {
        const exists = fs.existsSync(cfg.credentials_file);
        console.log(`  credentials     : ${cfg.credentials_file} ${exists ? '✓' : '✗ (file not found)'}`);
      }
    }
    console.log('');
    break;
  }

  case 'config':
    if (fs.existsSync(CONFIG)) {
      console.log(JSON.stringify(JSON.parse(fs.readFileSync(CONFIG, 'utf8')), null, 2));
    } else {
      console.log('No config yet. Run /remote setup in Claude Code.');
    }
    break;

  case 'list':
    if (fs.existsSync(TUNNELS)) {
      const t = JSON.parse(fs.readFileSync(TUNNELS, 'utf8'));
      const entries = Object.entries(t.active || {});
      if (entries.length === 0) {
        console.log('No active tunnels.');
      } else {
        entries.forEach(([name, e]) => {
          console.log(`${name.padEnd(24)} ${e.public_url}  pid:${e.pid}`);
        });
      }
    } else {
      console.log('No tunnels state found.');
    }
    break;

  case 'uninstall':
    require('../uninstall.js');
    break;

  default:
    console.log(`
remote-boy CLI

  remote-boy           show install status
  remote-boy check     same
  remote-boy config    print current config
  remote-boy list      list active tunnels (from state file)
  remote-boy uninstall remove the Claude Code skill

For tunnel management use /remote inside Claude Code.
`);
}
