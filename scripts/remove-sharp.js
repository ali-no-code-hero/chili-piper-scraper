#!/usr/bin/env node
/**
 * Removes sharp and @img/* (libvips LGPL) from node_modules after install.
 * Next.js is configured with images.unoptimized: true so these are not used.
 * Run as part of postinstall to keep the dependency tree free of LGPL packages.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const nodeModules = path.join(root, 'node_modules');

const toRemove = [
  path.join(nodeModules, 'sharp'),
  path.join(nodeModules, '@img'),
];

for (const dir of toRemove) {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true });
      console.log('[remove-sharp] Removed:', path.relative(root, dir));
    }
  } catch (e) {
    console.warn('[remove-sharp] Could not remove', dir, (e && e.message) || e);
  }
}
