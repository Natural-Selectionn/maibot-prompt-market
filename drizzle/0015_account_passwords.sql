CREATE TABLE auth_passwords (
  user_id text PRIMARY KEY NOT NULL REFERENCES user_profiles(user_id),
  password_hash text NOT NULL,
  updated_at text NOT NULL
);
--> statement-breakpoint
ALTER TABLE email_challenges ADD COLUMN purpose text NOT NULL DEFAULT 'register';
