import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { BackendMigrationMissingAlert } from '@/components/access/BackendMigrationMissingAlert';

describe('BackendMigrationMissingAlert', () => {
  it('renders nothing for non-backend errors', () => {
    const html = renderToString(React.createElement(BackendMigrationMissingAlert, { errorCode: 'unknown' }));
    expect(html).toBe('');
  });

  it('renders system guidance and retry action for backend migration missing', () => {
    const onRetry = vi.fn();
    const html = renderToString(
      React.createElement(BackendMigrationMissingAlert, {
        errorCode: 'backend_migration_missing',
        onRetry,
      }),
    );

    expect(html).toContain('System setup issue detected');
    expect(html).toContain('migrations are not fully deployed');
    expect(html).toContain('Upgrade or payment actions are temporarily unavailable');
    expect(html).toContain('Retry');
  });
});
