const { ensureCacheDirectories, getColdCacheAgeMs, formatCacheAgeMinutes } = require('../../tx/ocl/cache/cache-utils');
const fs = require('fs');
const path = require('path');

describe('cache-utils', () => {
  it('should format cache age in minutes', () => {
    expect(formatCacheAgeMinutes(60000)).toBe('1 minute');
    expect(formatCacheAgeMinutes(120000)).toBe('2 minutes');
  });

  // Adicione mais testes para getColdCacheAgeMs e ensureCacheDirectories
});
