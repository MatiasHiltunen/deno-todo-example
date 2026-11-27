import assert from "node:assert/strict";
import { readConfig } from "../../src/config.ts";

const url = "postgresql://todo:example@localhost:5432/todo";

Deno.test("config: defaults and explicit settings", () => {
  assert.deepEqual(readConfig({ DATABASE_URL: url }), {
    databaseUrl: url,
    hostname: "0.0.0.0",
    port: 8000,
  });
  assert.deepEqual(readConfig({ DATABASE_URL: url, HOST: "127.0.0.1", PORT: "3001" }), {
    databaseUrl: url,
    hostname: "127.0.0.1",
    port: 3001,
  });
});

Deno.test("config: reject missing or malformed database URLs without echoing credentials", () => {
  for (const databaseUrl of [undefined, "", "not-a-url", "https://host/db", "postgres://host/"]) {
    assert.throws(() => readConfig({ DATABASE_URL: databaseUrl }), /DATABASE_URL/);
  }
});

Deno.test("config: reject invalid ports and bind addresses", () => {
  for (const port of ["", "0", "65536", "-1", "1.5", "abc"]) {
    assert.throws(() => readConfig({ DATABASE_URL: url, PORT: port }), /PORT/);
  }
  for (const hostname of ["", " ", "host name", "http://localhost"]) {
    assert.throws(() => readConfig({ DATABASE_URL: url, HOST: hostname }), /HOST/);
  }
});
