// Unsigned-integer compatibility layer for Solana buffer-layout-utils.
// Uses JavaScript BigInt only; no native bigint-buffer binding is loaded.
const { Buffer } = require('buffer');
function toBigIntBE(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Expected bytes');
  let result = 0n;
  for (const byte of bytes) result = (result << 8n) | BigInt(byte);
  return result;
}
function toBigIntLE(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Expected bytes');
  let result = 0n;
  for (let index = bytes.length - 1; index >= 0; index--) result = (result << 8n) | BigInt(bytes[index]);
  return result;
}
function encode(value, width, littleEndian) {
  if (typeof value !== 'bigint' || value < 0n) throw new TypeError('Expected an unsigned BigInt');
  if (!Number.isSafeInteger(width) || width < 0 || width > 1024) throw new RangeError('Unsupported integer width');
  if (value >= (1n << BigInt(width * 8))) throw new RangeError('Integer exceeds buffer width');
  const result = Buffer.alloc(width);
  for (let index = 0; index < width; index++) { result[littleEndian ? index : width - index - 1] = Number(value & 255n); value >>= 8n; }
  return result;
}
exports.toBigIntBE = toBigIntBE;
exports.toBigIntLE = toBigIntLE;
exports.toBufferBE = (value, width) => encode(value, width, false);
exports.toBufferLE = (value, width) => encode(value, width, true);
