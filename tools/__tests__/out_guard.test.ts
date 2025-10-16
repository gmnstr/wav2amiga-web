import { execSync } from 'node:child_process';
import { test, expect } from 'vitest';

test('no tracked files under out/', () => {
  const listed = execSync('git ls-files out || true').toString().trim();
  expect(listed).toBe('');
});
