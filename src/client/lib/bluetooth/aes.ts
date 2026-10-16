/**
 * AES-128 on one 16-byte block, as smart cubes encrypt their messages (FIPS-197). Neither the Web Crypto API (padded
 * modes only, and asynchronous) nor React Native offers a bare block cipher; this one is small and synchronous.
 */

const SBOX = new Uint8Array(256),
  INV_SBOX = new Uint8Array(256);
{
  // The S-box from its definition: the inverse in GF(2⁸) followed by the affine map (p walks the powers of 3, q its
  // inverses).
  const rotl = (x: number, n: number) => ((x << n) | (x >> (8 - n))) & 0xff;
  let p = 1,
    q = 1;
  do {
    p = (p ^ (p << 1) ^ (p & 0x80 ? 0x1b : 0)) & 0xff;
    q = (q ^ (q << 1)) & 0xff;
    q = (q ^ (q << 2)) & 0xff;
    q = (q ^ (q << 4)) & 0xff;
    if (q & 0x80) q ^= 0x09;
    const s = q ^ rotl(q, 1) ^ rotl(q, 2) ^ rotl(q, 3) ^ rotl(q, 4) ^ 0x63;
    SBOX[p] = s;
    INV_SBOX[s] = p;
  } while (p !== 1);
  SBOX[0] = 0x63;
  INV_SBOX[0x63] = 0;
}
const xtime = (a: number) => ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;
const mul = (a: number, b: number) => {
  let r = 0;
  for (; b; b >>= 1, a = xtime(a)) if (b & 1) r ^= a;
  return r;
};

/** The 11 round keys of a 16-byte key, end to end. */
function expand(key: ArrayLike<number>): Uint8Array {
  if (key.length !== 16) throw new Error("An AES-128 key has 16 bytes");
  const w = new Uint8Array(176);
  w.set(Array.from(key));
  for (let i = 16, rcon = 1; i < 176; i += 4) {
    let t = [w[i - 4]!, w[i - 3]!, w[i - 2]!, w[i - 1]!];
    if (i % 16 === 0) {
      t = [SBOX[t[1]!]! ^ rcon, SBOX[t[2]!]!, SBOX[t[3]!]!, SBOX[t[0]!]!];
      rcon = xtime(rcon);
    }
    for (let j = 0; j < 4; j++) w[i + j] = w[i - 16 + j]! ^ t[j]!;
  }
  return w;
}

/** A block cipher of one key: `encrypt` and `decrypt` change the 16 bytes at `offset` in place. */
export function aes128(key: ArrayLike<number>) {
  const w = expand(key);
  const addKey = (s: Uint8Array, round: number) => {
    for (let i = 0; i < 16; i++) s[i]! ^= w[round * 16 + i]!;
  };
  // Bytes go column by column: byte i is in row i % 4, column i / 4; row r turns left by r (right to decrypt).
  const shift = (s: Uint8Array, dir: 1 | -1) => {
    const t = s.slice();
    for (let i = 0; i < 16; i++) s[i] = t[(i % 4) + 4 * ((((i >> 2) + dir * (i % 4)) % 4 + 4) % 4)]!;
  };
  const mix = (s: Uint8Array, m: readonly number[]) => {
    for (let c = 0; c < 16; c += 4) {
      const col = [s[c]!, s[c + 1]!, s[c + 2]!, s[c + 3]!];
      for (let r = 0; r < 4; r++) s[c + r] = mul(col[0]!, m[(4 - r) % 4]!) ^ mul(col[1]!, m[(5 - r) % 4]!) ^ mul(col[2]!, m[(6 - r) % 4]!) ^ mul(col[3]!, m[(7 - r) % 4]!);
    }
  };
  const sub = (s: Uint8Array, box: Uint8Array) => {
    for (let i = 0; i < 16; i++) s[i] = box[s[i]!]!;
  };
  return {
    encrypt(data: Uint8Array, offset = 0) {
      const s = data.subarray(offset, offset + 16);
      addKey(s, 0);
      for (let round = 1; round <= 10; round++) {
        sub(s, SBOX);
        shift(s, 1);
        if (round < 10) mix(s, [2, 3, 1, 1]);
        addKey(s, round);
      }
    },
    decrypt(data: Uint8Array, offset = 0) {
      const s = data.subarray(offset, offset + 16);
      addKey(s, 10);
      for (let round = 9; round >= 0; round--) {
        shift(s, -1);
        sub(s, INV_SBOX);
        addKey(s, round);
        if (round > 0) mix(s, [14, 11, 13, 9]);
      }
    },
  };
}
