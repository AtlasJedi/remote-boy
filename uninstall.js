#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

const TARGET = path.join(os.homedir(), '.claude', 'skills', 'remote');

try {
  if (fs.existsSync(TARGET)) {
    const stat = fs.lstatSync(TARGET);
    if (stat.isSymbolicLink() || stat.isFile()) {
      fs.unlinkSync(TARGET);
    } else {
      fs.rmSync(TARGET, { recursive: true });
    }
    console.log('\nremote-boy uninstalled ✓');
    console.log('  State (~/.remote-boy/) was not removed — delete manually if wanted.\n');
  } else {
    console.log('\nremote-boy: nothing to uninstall.\n');
  }
} catch (err) {
  console.warn(`\nremote-boy: uninstall failed: ${err.message}\n`);
}
