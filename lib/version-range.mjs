export const DEFAULT_MIN_VERSION = "1.0.0";
export const MAX_VERSION_LENGTH = 40;

export function normalizeVersion(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length > MAX_VERSION_LENGTH || !/^\d+(?:\.\d+){0,2}$/.test(text)) return null;
  const parts = text.split(".").map(part => part.replace(/^0+(?=\d)/, ""));
  while (parts.length < 3) parts.push("0");
  const normalized = parts.join(".");
  return normalized.length <= MAX_VERSION_LENGTH ? normalized : null;
}

// Fixed-width decimal segments preserve numeric order in SQLite/D1 without
// floating-point rounding or filtering an already paginated result set.
export function versionKey(value) {
  const normalized = normalizeVersion(value);
  if (!normalized) throw new Error("版本格式无效。");
  return normalized.split(".").map(part => part.padStart(MAX_VERSION_LENGTH, "0")).join("");
}

export function readVersionRange(minimum, maximum) {
  if (typeof minimum === "string") minimum = minimum.trim();
  if (typeof maximum === "string") maximum = maximum.trim();
  const minVersion = normalizeVersion(minimum === undefined || minimum === "" ? DEFAULT_MIN_VERSION : minimum);
  if (!minVersion) return { error: "最低版本格式无效，例如 1.2.5。" };
  const unlimited = maximum === undefined || maximum === null || maximum === "" || maximum === "最新";
  const maxVersion = unlimited ? null : normalizeVersion(maximum);
  if (!unlimited && !maxVersion) return { error: "最高版本格式无效，例如 1.2.5；留空表示最新。" };
  if (maxVersion && versionKey(maxVersion) < versionKey(minVersion)) return { error: "最高版本不能低于最低版本。" };
  return { minVersion, maxVersion };
}

export function versionRangeStorage(range) {
  return { minVersionKey: versionKey(range.minVersion), maxVersionKey: range.maxVersion === null ? null : versionKey(range.maxVersion) };
}

export function supportsVersion(range, value) {
  const normalized = normalizeVersion(value);
  if (!normalized) return false;
  const key = versionKey(normalized);
  return versionKey(range.minVersion) <= key && (range.maxVersion === null || versionKey(range.maxVersion) >= key);
}

export function formatVersionRange(range) {
  return `${range.minVersion} — ${range.maxVersion ?? "最新"}`;
}
