import type { D1Database } from "@cloudflare/workers-types";
import { openSqliteD1 } from "./sqlite-d1.mjs";

let database: D1Database | undefined;

export const env = {
  get DB(): D1Database {
    // This is a local SQLite adapter. D1 is only the query interface used by Drizzle.
    database ??= openSqliteD1(process.env.MAIBOT_DATABASE_PATH ?? "./data/maibot.sqlite") as unknown as D1Database;
    return database;
  },
};
