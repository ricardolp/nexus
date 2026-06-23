import assert from "node:assert/strict";
import {
  redactSensitiveFields,
  truncateJsonForLog,
} from "./integration-log.service.js";

function testTruncateJsonForLog() {
  const small = { a: 1 };
  assert.deepEqual(truncateJsonForLog(small), small);

  const big = { data: "x".repeat(100_000) };
  const truncated = truncateJsonForLog(big) as {
    _truncated: boolean;
    _preview: string;
    _originalBytes: number;
  };
  assert.equal(truncated._truncated, true);
  assert.ok(truncated._originalBytes > 64 * 1024);
}

function testRedactSensitiveFields() {
  const input = {
    Authorization: "secret",
    nested: { client_secret: "abc", ok: 1 },
  };
  const out = redactSensitiveFields(input) as Record<string, unknown>;
  assert.equal(out.Authorization, "[REDACTED]");
  assert.deepEqual(out.nested, { client_secret: "[REDACTED]", ok: 1 });
}

testTruncateJsonForLog();
testRedactSensitiveFields();
console.log("integration-log.service.test.ts: ok");
