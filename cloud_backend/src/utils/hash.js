import { createHash } from "node:crypto";

export function digestText(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}
