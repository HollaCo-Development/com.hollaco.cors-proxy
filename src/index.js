import * as azFunc from '@azure/functions';
import azureFunctionsOtel from '@azure/functions-opentelemetry-instrumentation';
import { AzureMonitorLogExporter, AzureMonitorTraceExporter } from '@azure/monitor-opentelemetry-exporter';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { NodeTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;

if (!connectionString) {
  // Local `func start` has no App Insights resource. Announce it once, because
  // a telemetry pipeline that is off looks exactly like one that is broken.
  console.log('APPLICATIONINSIGHTS_CONNECTION_STRING not set — OpenTelemetry export disabled.');
} else {
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'hollaco-cors-proxy'
  });

  // SimpleSpanProcessor rather than Batch: on Flex Consumption the worker can be
  // frozen or torn down between invocations, taking an unflushed batch queue with
  // it. At this app's volume batching buys nothing worth that risk.
  const tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors: [new SimpleSpanProcessor(new AzureMonitorTraceExporter({ connectionString }))]
  });
  tracerProvider.register();

  // Required, not optional. registerAzFunc below sets WorkerOpenTelemetryEnabled
  // on the host, which stops the host forwarding worker logs — after that,
  // ctx.log() reaches Application Insights only through this provider.
  const loggerProvider = new LoggerProvider({ resource });
  loggerProvider.addLogRecordProcessor(
    new SimpleLogRecordProcessor(new AzureMonitorLogExporter({ connectionString }))
  );

  // The package is CJS-only, so under ESM its classes arrive on the default export.
  const azureFunctions = new azureFunctionsOtel.AzureFunctionsInstrumentationESM();

  // Only outbound fetch is instrumented here. The Functions host emits the request
  // telemetry itself under host.json telemetryMode; instrumenting HTTP in the
  // worker too would double-count every invocation.
  registerInstrumentations({
    tracerProvider,
    loggerProvider,
    instrumentations: [new UndiciInstrumentation(), azureFunctions]
  });

  // ESM bypasses the require hook this instrumentation normally patches through,
  // so hand it the module explicitly. Must run after registerInstrumentations —
  // that is what assigns the tracer and logger it patches with.
  azureFunctions.registerAzFunc(azFunc);
}
