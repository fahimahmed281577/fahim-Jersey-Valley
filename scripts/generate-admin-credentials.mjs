#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Admin Credentials & Session Secret Generator for Jersey Valley.
 * Generates a standard 60-character bcrypt hash ($2b$12$...) and a 64-character
 * cryptographically secure hex session secret for Vercel / server-only environments.
 * 
 * Usage:
 *   node scripts/generate-admin-credentials.mjs
 *   node scripts/generate-admin-credentials.mjs "MySecurePassphraseHere123!"
 *   node scripts/generate-admin-credentials.mjs "MySecurePassphraseHere123!" "mycustomadminid"
 */

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const customPassword = process.argv[2];
const customAdminId = (process.argv[3] || 'jvadmin').trim();

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

const plainPassword = customPassword && customPassword.trim().length > 0
  ? customPassword.trim()
  : generateRandomPassphrase(20);

// Bcrypt cost factor 12 provides strong protection against GPU-accelerated brute-forcing
const saltRounds = 12;
const passwordHash = bcrypt.hashSync(plainPassword, saltRounds);

// Cryptographically random 32-byte secret (64 hex characters) for HMAC-SHA256 session signatures
const sessionSecret = crypto.randomBytes(32).toString('hex');

console.log('\n================================================================');
console.log('       JERSEY VALLEY — STANDALONE ADMIN CREDENTIALS GENERATOR    ');
console.log('================================================================\n');

console.log('1. CREDENTIALS TO LOG IN (Store in your password manager):');
console.log('----------------------------------------------------------------');
console.log(`   Admin ID:              ${customAdminId}`);
console.log(`   Admin Password:        ${plainPassword}`);
console.log('----------------------------------------------------------------\n');

console.log('2. SERVER-ONLY ENVIRONMENT VARIABLES:');
console.log('----------------------------------------------------------------');
console.log('# Add these to Vercel (Project Settings > Environment Variables)');
console.log('# or into your local server .env file.');
console.log('# CRITICAL: NEVER prefix these with VITE_ and NEVER commit them.');
console.log('----------------------------------------------------------------');
console.log(`ADMIN_LOGIN_ID="${customAdminId}"`);
console.log(`ADMIN_PASSWORD_HASH="${passwordHash}"`);
console.log(`ADMIN_SESSION_SECRET="${sessionSecret}"`);
console.log('----------------------------------------------------------------\n');

console.log('3. VERIFICATION CHECKS:');
console.log(`   ✓ Bcrypt Hash Length:   ${passwordHash.length} chars (Standard format: ${passwordHash.slice(0, 7)}...)`);
console.log(`   ✓ Session Secret Size:  ${sessionSecret.length} chars (HMAC-SHA256 256-bit entropy)`);
console.log(`   ✓ Bcrypt Self-Check:    ${bcrypt.compareSync(plainPassword, passwordHash) ? 'PASSED' : 'FAILED'}\n`);
