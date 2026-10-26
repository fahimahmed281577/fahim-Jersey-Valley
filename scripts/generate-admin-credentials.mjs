#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Admin Credentials & Session Secret Generator for Jersey Valley.
 * Generates a standard 60-character bcrypt hash ($2b$12$...) and a 64-character
 * cryptographically secure hex session secret for Vercel / server-only environments.
 * 
 * Secure Usage Options:
 *   1. Automatic secure passphrase generation:
 *      node scripts/generate-admin-credentials.mjs
 * 
 *   2. Custom password via environment variable (does NOT record in shell history):
 *      ADMIN_NEW_PASSWORD="your-secure-password" node scripts/generate-admin-credentials.mjs
 * 
 *   3. Custom password via CLI argument:
 *      node scripts/generate-admin-credentials.mjs "your-secure-password" "custom-admin-id"
 */

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const envPassword = process.env.ADMIN_NEW_PASSWORD;
const argPassword = process.argv[2];
const customAdminId = (process.argv[3] || process.env.ADMIN_NEW_ID || 'jvadmin').trim();

const isCustomProvided = Boolean(
  (envPassword && envPassword.trim().length > 0) ||
  (argPassword && argPassword.trim().length > 0)
);

// If no password provided, generate a 20-character high-entropy alphanumeric passphrase
function generateRandomPassphrase(length = 20) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*';
  const randomBytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  return result;
}

const plainPassword = isCustomProvided
  ? (envPassword ? envPassword.trim() : argPassword.trim())
  : generateRandomPassphrase(20);

// Bcrypt cost factor 12 provides strong protection against GPU-accelerated brute-forcing
const saltRounds = 12;
const passwordHash = bcrypt.hashSync(plainPassword, saltRounds);

// Cryptographically random 32-byte secret (64 hex characters) for HMAC-SHA256 session signatures
const sessionSecret = crypto.randomBytes(32).toString('hex');

console.log('\n================================================================');
console.log('       JERSEY VALLEY — STANDALONE ADMIN CREDENTIALS GENERATOR    ');
console.log('================================================================\n');

if (!isCustomProvided) {
  console.log('1. GENERATED CREDENTIALS (Save to your password manager now):');
  console.log('----------------------------------------------------------------');
  console.log(`   Admin ID:              ${customAdminId}`);
  console.log(`   Admin Password:        ${plainPassword}`);
  console.log('----------------------------------------------------------------\n');
} else {
  console.log('1. CUSTOM CREDENTIALS PROCESSED:');
  console.log('----------------------------------------------------------------');
  console.log(`   Admin ID:              ${customAdminId}`);
  console.log(`   Admin Password:        [PROTECTED — Plaintext password is not logged]`);
  console.log('----------------------------------------------------------------\n');
}

console.log('2. SERVER-ONLY ENVIRONMENT VARIABLES TO SET IN VERCEL:');
console.log('----------------------------------------------------------------');
console.log('# In Vercel Project Settings > Environment Variables:');
console.log('# CRITICAL: Select Production, Preview, and Development.');
console.log('# CRITICAL: NEVER prefix these with VITE_ and NEVER commit them.');
console.log('----------------------------------------------------------------');
console.log(`ADMIN_LOGIN_ID="${customAdminId}"`);
console.log(`ADMIN_PASSWORD_HASH="${passwordHash}"`);
console.log(`ADMIN_SESSION_SECRET="${sessionSecret}"`);
console.log('----------------------------------------------------------------\n');

console.log('3. VERIFICATION CHECKS:');
console.log(`   ✓ Bcrypt Hash Length:   ${passwordHash.length} chars (Standard format: ${passwordHash.slice(0, 7)}...)`);
console.log(`   ✓ Session Secret Size:  ${sessionSecret.length} chars (HMAC-SHA256 256-bit entropy)`);
console.log(`   ✓ Regex Compatibility:  ${/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(passwordHash) ? 'PASSED ($2b$12$...)' : 'FAILED'}`);
console.log(`   ✓ Bcrypt Self-Check:    ${bcrypt.compareSync(plainPassword, passwordHash) ? 'PASSED' : 'FAILED'}\n`);
