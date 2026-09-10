const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const mode = process.argv[2];
const secret = process.env.QUARTERFULL_STORAGE_STATE_B64 || '';
const statePath = process.env.QUARTERFULL_STORAGE_STATE_PATH || '/tmp/quarterfull-storage.json';
const cacheFile = process.env.QF_AUTH_CACHE_FILE || path.resolve(__dirname, '../.qf-auth-cache/state.enc');
const MAGIC = Buffer.from('QFAC2');

function keyFromSecret() {
  if (!secret) throw new Error('AUTH_REQUIRED:QUARTERFULL_STORAGE_STATE_B64');
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function decodeBootstrap() {
  if (!secret) throw new Error('AUTH_REQUIRED:QUARTERFULL_STORAGE_STATE_B64');
  let buf = Buffer.from(secret, 'base64');
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const text = buf.toString('utf8');
  JSON.parse(text);
  return text;
}

function decryptCache() {
  const packed = fs.readFileSync(cacheFile);
  if (packed.length < MAGIC.length + 12 + 16 || !packed.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('CACHE_FORMAT_INVALID');
  }
  let off = MAGIC.length;
  const iv = packed.subarray(off, off + 12); off += 12;
  const tag = packed.subarray(off, off + 16); off += 16;
  const ciphertext = packed.subarray(off);
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyFromSecret(), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  JSON.parse(plain);
  return plain;
}

function encryptState(text) {
  JSON.parse(text);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFromSecret(), iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, tag, ciphertext]);
}

function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

if (mode === 'prepare') {
  let source = 'bootstrap';
  let text;
  if (fs.existsSync(cacheFile)) {
    try {
      text = decryptCache();
      source = 'encrypted-cache';
    } catch (e) {
      // A changed bootstrap secret intentionally invalidates old cache encryption.
      console.log(`QF_AUTH_CACHE_FALLBACK:${e.message}`);
    }
  }
  if (!text) text = decodeBootstrap();
  atomicWrite(statePath, text);
  console.log(`QF_AUTH_STATE_READY source=${source}`);
} else if (mode === 'seal') {
  if (!fs.existsSync(statePath)) {
    console.log('QF_AUTH_CACHE_SKIP:no-state');
    process.exit(0);
  }
  const text = fs.readFileSync(statePath, 'utf8');
  const packed = encryptState(text);
  atomicWrite(cacheFile, packed);
  console.log('QF_AUTH_CACHE_SEALED');
} else {
  throw new Error('USAGE: node qf_auth_cache.js prepare|seal');
}
