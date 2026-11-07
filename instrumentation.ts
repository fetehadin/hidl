export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { posthogLoggerProvider } = await import("./src/lib/posthog-logs");
  const shutdown = () => {
    void Promise.race([
      posthogLoggerProvider.shutdown(),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]).catch(() => {});
  };
  const nodeProcess = process;
  nodeProcess.once("SIGTERM", shutdown);
  nodeProcess.once("SIGINT", shutdown);
}
