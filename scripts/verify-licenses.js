#!/usr/bin/env node
/**
 * Verifies that required license and notice files exist for compliance.
 * Run: npm run licenses:verify
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

const REQUIRED = [
  'licenses/Apache-2.0.txt',
  'licenses/CC-BY-4.0.txt',
  'licenses/BSD-2-Clause.txt',
  'licenses/BSD-3-Clause.txt',
  'licenses/MIT.txt',
  'NOTICE.md',
]

const OPTIONAL = [
  'licenses/ISC.txt',
  'licenses/LGPL-3.0-or-later.txt',
  'licenses/MPL-2.0.txt',
  'THIRD_PARTY_LICENSES.md',
  'NOTICE-playwright-third-party.txt',
]

function check(file) {
  const full = path.join(ROOT, file)
  return fs.existsSync(full)
}

const missingRequired = REQUIRED.filter((f) => !check(f))
const missingOptional = OPTIONAL.filter((f) => !check(f))

if (missingRequired.length > 0) {
  console.error('Missing required license/notice files:')
  missingRequired.forEach((f) => console.error('  -', f))
  process.exit(1)
}

if (missingOptional.length > 0) {
  console.log('Optional files not found (ok to omit):')
  missingOptional.forEach((f) => console.log('  -', f))
}

console.log('Licenses verify OK: all required files present.')
process.exit(0)
