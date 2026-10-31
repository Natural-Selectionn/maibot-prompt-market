export function createPasswordStore(db) {
  const first = async (sql, ...values) => (await db.prepare(sql).bind(...values).all()).results[0] ?? null;
  const guard = "EXISTS (SELECT 1 FROM auth_passwords a JOIN user_profiles p ON p.user_id=a.user_id WHERE a.user_id=? AND a.password_hash=? AND p.disabled=0)";
  return {
    async account(email) {
      return first(`SELECT i.user_id, p.disabled, a.password_hash FROM auth_identities i JOIN user_profiles p ON p.user_id=i.user_id
        LEFT JOIN auth_passwords a ON a.user_id=i.user_id WHERE i.provider='email' AND i.subject=?`, email);
    },
    async details(userId) {
      const row = await first(`SELECT i.subject AS address, EXISTS(SELECT 1 FROM auth_passwords WHERE user_id=i.user_id) AS has_password
        FROM auth_identities i WHERE i.user_id=? AND i.provider='email'`, userId);
      return { address: row?.address ?? null, hasPassword: !!row?.has_password };
    },
    async limit(keys, now = Date.now()) {
      // One transaction reserves all limits before any costly password hash.
      const id = crypto.randomUUID();
      const condition = keys.map(() => "(key=? AND reset_at>? AND count>=?)").join(" OR ");
      const values = keys.flatMap(({ key, max }) => [key, now, max]);
      const results = await db.batch([
        db.prepare("DELETE FROM email_rate_limits WHERE reset_at<=?").bind(now),
        db.prepare(`INSERT INTO email_rate_limits(key,count,reset_at,last_sent_at) SELECT ?,1,?,? WHERE NOT EXISTS
          (SELECT 1 FROM email_rate_limits WHERE ${condition})`).bind(id, now + 60000, now, ...values),
        ...keys.map(({ key, window }) => db.prepare(`INSERT INTO email_rate_limits(key,count,reset_at,last_sent_at)
          SELECT ?,1,?,? WHERE EXISTS(SELECT 1 FROM email_rate_limits WHERE key=?)
          ON CONFLICT(key) DO UPDATE SET count=count+1,last_sent_at=excluded.last_sent_at`).bind(key, now + window, now, id)),
        db.prepare("DELETE FROM email_rate_limits WHERE key=?").bind(id),
      ]);
      return results[1].meta.changes === 1;
    },
    async register(email, displayName, passwordHash, sessionHash, expiresAt) {
      const userId = `user:${crypto.randomUUID()}`;
      const name = displayName || "麦麦用户";
      const key = name.normalize("NFKC").toLocaleLowerCase();
      const now = new Date().toISOString();
      await db.batch([
        db.prepare("INSERT INTO user_profiles(user_id,display_name,name_key,updated_at) VALUES(?,?,?,?)").bind(userId, name, key, now),
        db.prepare("UPDATE user_profiles SET disambiguated=1 WHERE name_key=? AND (SELECT count(*) FROM user_profiles WHERE name_key=?)>1").bind(key, key),
        db.prepare("INSERT INTO auth_identities(provider,subject,user_id,created_at) VALUES('email',?,?,?)").bind(email, userId, now),
        db.prepare("INSERT INTO auth_passwords(user_id,password_hash,updated_at) VALUES(?,?,?)").bind(userId, passwordHash, now),
        db.prepare("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(sessionHash, userId, expiresAt),
      ]);
      return userId;
    },
    async login(userId, passwordHash, sessionHash, expiresAt) {
      const result = await db.prepare(`INSERT INTO auth_sessions(token_hash,user_id,expires_at) SELECT ?,?,? WHERE ${guard}`)
        .bind(sessionHash, userId, expiresAt, userId, passwordHash).run();
      return result.meta.changes === 1;
    },
    /** @param {string | null} binding */
    async replace(userId, previousHash, passwordHash, sessionHash, expiresAt, binding = null, now = Date.now()) {
      const liveBinding = binding ? " AND (EXISTS(SELECT 1 FROM auth_sessions WHERE token_hash=? AND user_id=? AND expires_at>?) OR EXISTS(SELECT 1 FROM test_sessions WHERE token_hash=? AND user_id=? AND expires_at>?))" : "";
      const bindingValues = binding ? [binding, userId, now, binding, userId, now] : [];
      const result = await db.batch([
        previousHash
          ? db.prepare(`UPDATE auth_passwords SET password_hash=?,updated_at=? WHERE user_id=? AND password_hash=?
              AND EXISTS(SELECT 1 FROM user_profiles WHERE user_id=? AND disabled=0)${liveBinding}`)
            .bind(passwordHash, new Date().toISOString(), userId, previousHash, userId, ...bindingValues)
          : db.prepare(`INSERT INTO auth_passwords(user_id,password_hash,updated_at) SELECT ?,?,?
              WHERE EXISTS(SELECT 1 FROM user_profiles WHERE user_id=? AND disabled=0)${liveBinding} ON CONFLICT(user_id) DO NOTHING`)
            .bind(userId, passwordHash, new Date().toISOString(), userId, ...bindingValues),
        db.prepare(`DELETE FROM auth_sessions WHERE user_id=? AND ${guard}`).bind(userId, userId, passwordHash),
        db.prepare(`DELETE FROM test_sessions WHERE user_id=? AND ${guard}`).bind(userId, userId, passwordHash),
        db.prepare(`DELETE FROM email_challenges WHERE email IN(SELECT subject FROM auth_identities WHERE user_id=? AND provider='email') AND ${guard}`).bind(userId, userId, passwordHash),
        db.prepare(`INSERT INTO auth_sessions(token_hash,user_id,expires_at) SELECT ?,?,? WHERE ${guard}`)
          .bind(sessionHash, userId, expiresAt, userId, passwordHash),
      ]);
      return result[0].meta.changes === 1 && result[4].meta.changes === 1;
    },
  };
}
