import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import azureFunctionsOtel from '@azure/functions-opentelemetry-instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { LoggerProvider, SimpleLogRecordProcessor, InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}

// These assertions guard wiring whose failure mode is silence: if the host or the
// entry point is misconfigured, the app keeps serving traffic and simply stops
// reporting, which is indistinguishable from a quiet week.
describe('OpenTelemetry wiring', () => {
  it('loads src/index.js as an entry point, so the bootstrap actually runs', () => {
    const pkg = readJson('../../package.json');
    expect(pkg.main).toContain('index.js');
  });

  it('keeps the function files as entry points alongside the bootstrap', () => {
    const pkg = readJson('../../package.json');
    expect(pkg.main).toContain('functions/*.js');
  });

  it('puts the Functions host in OpenTelemetry telemetry mode', () => {
    const host = readJson('../../host.json');
    expect(host.telemetryMode).toBe('OpenTelemetry');
  });

  it('carries no logging.applicationInsights block, which telemetryMode ignores', () => {
    const host = readJson('../../host.json');
    expect(host.logging?.applicationInsights).toBeUndefined();
  });

  it('declares every package the bootstrap imports as a runtime dependency', () => {
    const pkg = readJson('../../package.json');
    const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    const imported = [...source.matchAll(/from '([^']+)'/g)]
      .map((m) => m[1])
      .filter((name) => !name.startsWith('.') && !name.startsWith('node:'));

    expect(imported.length).toBeGreaterThan(0);
    for (const name of imported) {
      expect(pkg.dependencies, name + ' must be a runtime dependency').toHaveProperty(name);
    }
  });
});

// @azure/functions-opentelemetry-instrumentation bundles its own, much older copy
// of @opentelemetry/instrumentation, so its logger is plumbed across a version
// boundary. That matters more than it looks: registerAzFunc tells the Functions
// host to stop forwarding worker logs, so if this wiring ever breaks, ctx.log()
// output is dropped rather than duplicated — a silent loss a dependency bump
// could introduce without any error.
describe('Azure Functions instrumentation logger wiring', () => {
  it('routes emitted logs to the provider registered alongside it', () => {
    const exporter = new InMemoryLogRecordExporter();
    const loggerProvider = new LoggerProvider();
    loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(exporter));

    const instrumentation = new azureFunctionsOtel.AzureFunctionsInstrumentationESM();
    registerInstrumentations({
      tracerProvider: new NodeTracerProvider(),
      loggerProvider,
      instrumentations: [instrumentation]
    });

    instrumentation.logger.emit({ body: 'wiring check' });

    const records = exporter.getFinishedLogRecords();
    expect(records).toHaveLength(1);
    expect(records[0].body).toBe('wiring check');
  });
});
