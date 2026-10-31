import { parse, TomlError } from "smol-toml";
import { fieldLabels, fieldPaths, validateConfigFields, type FieldName, type PromptFields } from "./prompts.ts";

export const MAX_CONFIG_SOURCE_BYTES = 1024 * 1024;
export const CONFIG_SOURCE_SIZE_LABEL = `${MAX_CONFIG_SOURCE_BYTES / (1024 * 1024)} MiB`;

// Only traverse own properties and return the seven public prompt fields. The
// parsed source may also contain credentials and private conversation targets.
function ownPath(document: unknown, path: string): unknown {
  let value = document;
  for (const key of path.split(".")) {
    if (!value || typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

export function parseConfigSource(source: string, format: "toml" | "json" = "toml"): PromptFields {
  if (!source.trim()) throw new Error("源文件为空，请选择包含人设配置的 JSON 或 TOML 文件。");
  if (new TextEncoder().encode(source).byteLength > MAX_CONFIG_SOURCE_BYTES) throw new Error(`源文件不能超过 ${CONFIG_SOURCE_SIZE_LABEL}。`);
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  let document: unknown;
  try {
    document = format === "json" ? JSON.parse(normalized) : parse(normalized, { integersAsBigInt: "asNeeded" });
  } catch (cause) {
    // Parser errors can include source excerpts and private configuration.
    if (format === "json") throw new Error("无法解析 JSON，请检查文件格式。");
    const position = cause instanceof TomlError ? `（第 ${cause.line} 行，第 ${cause.column} 列）` : "";
    throw new Error(`无法解析 TOML${position}，请检查文件格式。`);
  }
  if (format === "json") {
    if (ownPath(document, "format") !== "maibot.personality") throw new Error("请选择 maibot.personality 格式的人设 JSON 文件。");
    if (ownPath(document, "version") !== 1) throw new Error("目前仅支持版本 1 的人设 JSON 文件。");
    const profile = ownPath(document, "profile");
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) throw new Error("人设 JSON 的 profile 需为对象。");
  } else {
    const bot = ownPath(document, "bot");
    if (!bot || typeof bot !== "object" || Array.isArray(bot)) throw new Error("旧版 TOML 配置片段不再支持，请选择 bot_config.toml 或人设 JSON。");
  }
  const fields: PromptFields = {};
  for (const key of Object.keys(fieldPaths) as FieldName[]) {
    const value = ownPath(document, format === "json" ? `profile.${key}` : fieldPaths[key]);
    if (value === undefined) continue;
    if (key === "multiple_probability") {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error("备用风格概率需为 0 到 1 之间的数字。");
      fields[key] = value;
    } else if (key === "multiple_reply_style") {
      if (!Array.isArray(value) || value.some(item => typeof item !== "string")) throw new Error("备用表达风格需为文本数组。");
      fields[key] = value;
    } else {
      if (typeof value !== "string") throw new Error(`${fieldLabels[key]}需为文本。`);
      fields[key] = value;
    }
  }
  // Reuse publication field limits; the title is only a validation placeholder
  // and is never imported into the user's draft.
  const result = validateConfigFields("源文件导入", fields);
  if (!result.fields) throw new Error(result.error === "请填写至少一个配置字段。" ? "未找到可导入的人设字段，请选择 bot_config.toml 或 MaiBot 人设 JSON。" : result.error);
  return result.fields;
}

export async function readConfigSource(file: Pick<File, "name" | "size" | "arrayBuffer">): Promise<PromptFields> {
  if (!/\.(toml|json)$/i.test(file.name)) throw new Error("请选择 bot_config.toml 或人设 .json 文件。");
  if (file.size > MAX_CONFIG_SOURCE_BYTES) throw new Error(`源文件不能超过 ${CONFIG_SOURCE_SIZE_LABEL}。`);
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > MAX_CONFIG_SOURCE_BYTES) throw new Error(`源文件不能超过 ${CONFIG_SOURCE_SIZE_LABEL}。`);
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new Error("源文件需使用 UTF-8 编码，请转换编码后重试。");
  }
  return parseConfigSource(source, /\.json$/i.test(file.name) ? "json" : "toml");
}
