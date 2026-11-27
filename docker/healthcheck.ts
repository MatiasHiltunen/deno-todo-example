/** Check the same readiness endpoint that an external monitor would use. */
try {
  const response = await fetch("http://127.0.0.1:8000/health/ready", {
    signal: AbortSignal.timeout(3_000),
  });
  await response.body?.cancel();
  Deno.exit(response.ok ? 0 : 1);
} catch {
  Deno.exit(1);
}
