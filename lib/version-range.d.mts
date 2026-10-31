export type VersionRange = { minVersion: string; maxVersion: string | null };
export const DEFAULT_MIN_VERSION: string;
export const MAX_VERSION_LENGTH: number;
export function normalizeVersion(value: unknown): string | null;
export function versionKey(value: string): string;
export function readVersionRange(minimum: unknown, maximum: unknown): (VersionRange & { error?: undefined }) | { error: string; minVersion?: undefined; maxVersion?: undefined };
export function versionRangeStorage(range: VersionRange): { minVersionKey: string; maxVersionKey: string | null };
export function supportsVersion(range: VersionRange, value: string): boolean;
export function formatVersionRange(range: VersionRange): string;
