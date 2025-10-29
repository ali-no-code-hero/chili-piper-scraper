#!/usr/bin/env node

const bcrypt = require('bcryptjs');

if (process.argv.length < 3) {
  console.log('Usage: node generate-password-hash.js <password>');
  console.log('Example: node generate-password-hash.js mySecurePassword123');
  process.exit(1);
}

const password = process.argv[2];
const saltRounds = 10;

bcrypt.hash(password, saltRounds, (err, hash) => {
  if (err) {
    console.error('Error generating hash:', err);
    process.exit(1);
  }
  
  console.log('Password:', password);
  console.log('Hash:', hash);
  console.log('');
  console.log('Add this to your .env file:');
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
});
