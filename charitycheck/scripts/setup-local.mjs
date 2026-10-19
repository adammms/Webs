import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const template = await readFile(
  new URL("../.env.example", import.meta.url),
  "utf8",
);
try {
  await writeFile(
    new URL("../.env", import.meta.url),
    template.replace(
      "replace-with-random-at-least-32-characters",
      randomBytes(32).toString("hex"),
    ),
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    "Konfigurasi pengembangan lokal dibuat. Jangan gunakan password contoh untuk deployment.",
  );
} catch (e) {
  if (e.code !== "EEXIST") throw e;
  console.log("Konfigurasi .env yang ada dipertahankan.");
}
