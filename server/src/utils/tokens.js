import { randomBytes, randomInt, createHash } from 'node:crypto';

export const newToken = () => randomBytes(32).toString('base64url');          // 43 chars
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const sixDigitCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
