import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DashboardPage from '../../app/(app)/dashboard/page';

describe('DashboardPage', () => {
  it('renders the secure publishing entry point', () => {
    const html = renderToStaticMarkup(<DashboardPage />);
    expect(html).toContain('One dispatch desk. Every channel.');
    expect(html).toContain('Enter the control room');
    expect(html).toContain('Sign in');
  });
});
