const ITERATIONS = 600000;
const hex = bytes => Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
const unhex = value => Uint8Array.from(value.match(/../g), byte => parseInt(byte, 16));
export function validatePassword(value) {
  if (typeof value !== "string" || value.length < 6 || value.length > 128) throw new Error("invalid_password");
  return value;
}
async function derive(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256)));
}
export async function hashPassword(value) {
  const password = validatePassword(value);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256:${ITERATIONS}:${hex(salt)}:${await derive(password, salt)}`;
}
export async function verifyPassword(value, encoded) {
  if (typeof value !== "string" || value.length > 128) return false;
  const valid = typeof encoded === "string" && /^pbkdf2-sha256:600000:[a-f0-9]{32}:[a-f0-9]{64}$/.test(encoded);
  // Missing credentials still perform the same expensive derivation.
  const parts = valid ? encoded.split(":") : ["", "", "0".repeat(32), "0".repeat(64)];
  const actual = await derive(value, unhex(parts[2]));
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ parts[3].charCodeAt(i);
  return valid && difference === 0;
}
