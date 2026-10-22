import { describe, expect, it } from 'vitest';

import { productionConfigProblems, type ProductionSettings } from '../src/env';

const safe: ProductionSettings = {
  jwtSecret: 'x'.repeat(48),
  databaseUrl: 'postgres://app:s3cure-generated@db.internal:5432/tablemates',
  s3: { accessKeyId: 'r2-key-id', secretAccessKey: 'r2-secret' },
  mailProvider: 'resend',
  corsOrigins: ['https://app.example.com'],
};

describe('production configuration guard', () => {
  it('accepts a configuration with its own secrets', () => {
    expect(productionConfigProblems(safe)).toEqual([]);
  });

  it('rejects every public development default', () => {
    const problems = productionConfigProblems({
      jwtSecret: 'change-me-to-a-long-random-string',
      databaseUrl: 'postgres://tablemates:tablemates@localhost:5433/tablemates',
      s3: { accessKeyId: 'tablemates', secretAccessKey: 'tablemates-dev' },
      mailProvider: 'mailpit',
      corsOrigins: ['http://localhost:8081'],
    });
    expect(problems).toHaveLength(5);
  });

  it('rejects a short JWT secret', () => {
    expect(productionConfigProblems({ ...safe, jwtSecret: 'short' })).toEqual([
      'JWT_SECRET must be a unique random value of at least 32 characters',
    ]);
  });
});
