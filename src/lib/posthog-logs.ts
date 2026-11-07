import { SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
const isConfigured = Boolean(posthogKey && posthogHost);

if (!isConfigured && process.env.NODE_ENV !== "production") {
  const missingVariable = posthogKey ? "NEXT_PUBLIC_POSTHOG_HOST" : "NEXT_PUBLIC_POSTHOG_KEY";
  console.warn(
    `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
  );
}

const posthogLogProcessors = posthogKey && posthogHost
  ? [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          url: new URL("/i/v1/logs", posthogHost).toString(),
          headers: {
            Authorization: `Bearer ${posthogKey}`,
            "Content-Type": "application/json",
          },
        }),
      }),
    ]
  : [];

export const posthogLoggerProvider = new LoggerProvider({
  resource: resourceFromAttributes({
    "service.name": "hidl",
    "deployment.environment": process.env.NODE_ENV ?? "development",
  }),
  processors: posthogLogProcessors,
});

// This dedicated logger is intentionally separate from the application's existing loggers.
// Only records emitted through it are sent to PostHog.
export const posthogLogsLogger = posthogLoggerProvider.getLogger("posthog-exporter");

export { SeverityNumber };
