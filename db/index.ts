import { env } from "@/db/binding";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  return drizzle(env.DB, { schema });
}
