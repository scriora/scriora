import { describe, expect, it } from 'vitest';
import DashboardPage from '../../app/(app)/dashboard/page';

describe('DashboardPage Component Test', () => {
  it('instantiates and returns dashboard main element', () => {
    const el = DashboardPage();
    expect(el).toBeDefined();
    expect(el.type).toBe('main');
  });
});
