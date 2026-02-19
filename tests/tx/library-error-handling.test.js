const { Library } = require('../../tx/library');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

describe('Library error handling', () => {
  let tmpDir;
  let yamlPath;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lib-test-'));
    yamlPath = path.join(tmpDir, 'library.yml');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function createLibrary(configFile) {
    const log = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    const stats = { addStat: jest.fn() };
    return { library: new Library(configFile, undefined, log, stats), log };
  }

  test('failed source does not prevent other sources from loading', async () => {
    // Config with 3 internal sources (no network needed)
    await fs.writeFile(yamlPath, [
      'base:',
      '  url: https://storage.googleapis.com/tx-fhir-org',
      'sources:',
      '  - internal:lang',
      '  - internal:INVALID_SOURCE',
      '  - internal:country',
    ].join('\n'));

    const { library, log } = createLibrary(yamlPath);
    await library.load();

    // The valid sources should have loaded; the invalid one should have been skipped
    const errorCalls = log.error.mock.calls.map(c => c[0]);
    const hasFailure = errorCalls.some(msg => msg.includes('INVALID_SOURCE'));
    expect(hasFailure).toBe(true);

    // Server should still be running (load() didn't throw)
    // Country and lang register as factories, not providers
    expect(library.codeSystemFactories.size).toBeGreaterThanOrEqual(2);
  }, 30000);

  test('failed source is skipped in subsequent loading phases', async () => {
    await fs.writeFile(yamlPath, [
      'base:',
      '  url: https://storage.googleapis.com/tx-fhir-org',
      'sources:',
      '  - internal:lang',
      '  - npm:nonexistent.package.that.does.not.exist#99.99.99',
      '  - internal:country',
    ].join('\n'));

    const { library, log } = createLibrary(yamlPath);

    // Spy on processSource to track calls
    const originalProcessSource = library.processSource.bind(library);
    const calls = [];
    library.processSource = async function (source, pm, mode) {
      calls.push({ source, mode });
      return originalProcessSource(source, pm, mode);
    };

    await library.load();

    // The npm source should have been called in fetch phase but NOT in cs/npm phases
    const npmFetchCalls = calls.filter(c => c.source.includes('nonexistent') && c.mode === 'fetch');
    const npmCsCalls = calls.filter(c => c.source.includes('nonexistent') && c.mode === 'cs');
    const npmNpmCalls = calls.filter(c => c.source.includes('nonexistent') && c.mode === 'npm');

    expect(npmFetchCalls.length).toBe(1);
    expect(npmCsCalls.length).toBe(0);
    expect(npmNpmCalls.length).toBe(0);
  }, 60000);

  test('summary warning lists all failed sources', async () => {
    await fs.writeFile(yamlPath, [
      'base:',
      '  url: https://storage.googleapis.com/tx-fhir-org',
      'sources:',
      '  - internal:BOGUS_ONE',
      '  - internal:lang',
      '  - internal:BOGUS_TWO',
    ].join('\n'));

    const { library, log } = createLibrary(yamlPath);
    await library.load();

    const warnCalls = log.warn.mock.calls.map(c => c[0]);
    const summary = warnCalls.find(msg => msg.includes('source(s) failed to load'));
    expect(summary).toBeDefined();
    expect(summary).toContain('BOGUS_ONE');
    expect(summary).toContain('BOGUS_TWO');
    expect(summary).toMatch(/^2 source/);
  }, 30000);

  test('load succeeds with empty sources', async () => {
    await fs.writeFile(yamlPath, [
      'base:',
      '  url: https://storage.googleapis.com/tx-fhir-org',
      'sources: []',
    ].join('\n'));

    const { library, log } = createLibrary(yamlPath);
    await library.load();

    // No errors, no warnings
    expect(log.error).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  }, 30000);
});
