import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const prompts = sqliteTable("prompts", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  kind: text("kind").notNull().default("config"),
  scene: text("scene").notNull(),
  minVersion: text("min_version").notNull().default("1.0.0"),
  maxVersion: text("max_version"),
  minVersionKey: text("min_version_key").notNull().default("000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000"),
  maxVersionKey: text("max_version_key"),
  tags: text("tags").notNull(),
  fields: text("fields").notNull(),
  templateName: text("template_name").notNull().default(""),
  templateLocale: text("template_locale").notNull().default(""),
  templateContent: text("template_content").notNull().default(""),
  templateFiles: text("template_files").notNull().default("[]"),
  templateBasis: text("template_basis").notNull().default("snapshot-1.2.5"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

// The API validates prompt_id against existing works before saving discussion.
// The historical schema stores this relationship without a foreign key.
export const comments = sqliteTable("prompt_comments", {
  id: text("id").primaryKey(),
  promptId: text("prompt_id").notNull(),
  userId: text("user_id").notNull(),
  author: text("author").notNull(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
  rootId: text("root_id"),
  replyToId: text("reply_to_id"),
  deletedAt: text("deleted_at"),
  operationKey: text("operation_key"),
}, table => [
  uniqueIndex("prompt_comments_operation").on(table.userId, table.operationKey),
  index("prompt_comments_user_created").on(table.userId, table.createdAt),
  index("prompt_comments_prompt_created").on(table.promptId, table.createdAt),
  index("prompt_comments_thread_created").on(table.promptId, table.rootId, table.createdAt),
]);

export const ratings = sqliteTable("prompt_ratings", {
  promptId: text("prompt_id").notNull(),
  userId: text("user_id").notNull(),
  score: integer("score").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [primaryKey({ columns: [table.promptId, table.userId] })]);

// Only hashes of server-issued browser tokens are stored. These identities
// are used for usage counts, never authentication or ownership.
export const usageVisitors = sqliteTable("usage_visitors", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id"),
  createdAt: text("created_at").notNull(),
});

export const promptUsage = sqliteTable("prompt_usage", {
  promptId: text("prompt_id").notNull().references(() => prompts.id, { onDelete: "cascade" }),
  actorId: text("actor_id").notNull(),
  action: text("action", { enum: ["copy", "download"] }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  primaryKey({ columns: [table.promptId, table.actorId, table.action] }),
  index("prompt_usage_recent").on(table.promptId, table.updatedAt),
  index("prompt_usage_actor").on(table.actorId),
]);

// Temporary, explicit test login. Guests never receive a session implicitly.
export const testSessions = sqliteTable("test_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull(),
  displayName: text("display_name").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const userProfiles = sqliteTable("user_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  nameKey: text("name_key").notNull(),
  disambiguated: integer("disambiguated", { mode: "boolean" }).notNull().default(false),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull(),
}, table => [index("user_profiles_name_key").on(table.nameKey)]);

export const authIdentities = sqliteTable("auth_identities", {
  provider: text("provider").notNull(),
  subject: text("subject").notNull(),
  userId: text("user_id").notNull().references(() => userProfiles.userId),
  createdAt: text("created_at").notNull(),
}, table => [primaryKey({ columns: [table.provider, table.subject] }), uniqueIndex("auth_identity_user_provider").on(table.userId, table.provider)]);

export const authSessions = sqliteTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => userProfiles.userId),
  expiresAt: integer("expires_at").notNull(),
}, table => [index("auth_sessions_expiry").on(table.expiresAt)]);

export const oauthFlows = sqliteTable("oauth_flows", {
  stateHash: text("state_hash").primaryKey(),
  provider: text("provider").notNull(),
  codeVerifier: text("code_verifier").notNull(),
  nonce: text("nonce").notNull(),
  returnTo: text("return_to").notNull(),
  linkUserId: text("link_user_id"),
  linkSessionHash: text("link_session_hash"),
  expiresAt: integer("expires_at").notNull(),
}, table => [index("oauth_flows_expiry").on(table.expiresAt)]);

export const emailChallenges = sqliteTable("email_challenges", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  purpose: text("purpose").notNull().default("register"),
  codeHash: text("code_hash").notNull(),
  browserHash: text("browser_hash").notNull(),
  displayName: text("display_name").notNull(),
  returnTo: text("return_to").notNull(),
  linkUserId: text("link_user_id"),
  linkSessionHash: text("link_session_hash"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, table => [index("email_challenges_expiry").on(table.expiresAt)]);

export const emailRateLimits = sqliteTable("email_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: integer("reset_at").notNull(),
  lastSentAt: integer("last_sent_at").notNull(),
});

export const authPasswords = sqliteTable("auth_passwords", {
  userId: text("user_id").primaryKey().references(() => userProfiles.userId),
  passwordHash: text("password_hash").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const announcements = sqliteTable("announcements", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  published: integer("published", { mode: "boolean" }).notNull().default(true),
  authorId: text("author_id").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [index("announcements_published_created").on(table.published, table.createdAt)]);

export const adminAudit = sqliteTable("admin_audit", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  targetId: text("target_id").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [index("admin_audit_created").on(table.createdAt)]);

export const moderationSettings = sqliteTable("moderation_settings", {
  id: integer("id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  timeoutMs: integer("timeout_ms").notNull().default(8000),
  maxAttempts: integer("max_attempts").notNull().default(2),
  providers: text("providers").notNull().default("[]"),
  revision: text("revision").notNull().default("initial"),
  updatedAt: text("updated_at").notNull().default(""),
});

export const moderationEvents = sqliteTable("moderation_events", {
  id: text("id").primaryKey(),
  workId: text("work_id").notNull(),
  operation: text("operation").notNull(),
  status: text("status").notNull(),
  category: text("category").notNull(),
  providerId: text("provider_id").notNull(),
  attempts: integer("attempts").notNull(),
  cause: text("cause").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [index("moderation_events_created").on(table.createdAt)]);

export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recipientUserId: text("recipient_user_id").notNull(),
  sourceKey: text("source_key").notNull(),
  type: text("type", { enum: ["comment", "reply", "rating"] }).notNull(),
  actorUserId: text("actor_user_id").notNull(),
  promptId: text("prompt_id").notNull(),
  commentId: text("comment_id"),
  createdAt: text("created_at").notNull(),
  readAt: text("read_at"),
  invalidatedAt: text("invalidated_at"),
}, table => [
  uniqueIndex("notifications_source").on(table.recipientUserId, table.sourceKey),
  index("notifications_inbox").on(table.recipientUserId, table.invalidatedAt, table.readAt, table.id),
  index("notifications_prompt").on(table.promptId),
]);
