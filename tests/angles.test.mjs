import test from 'node:test';
import assert from 'node:assert/strict';
import { angleProblem } from '../dist/angles.js';

test('selfie angles', () => {
  assert.equal(angleProblem([0.05, 0.4, -0.5]), null);
  assert.equal(angleProblem([0.05, -0.4, 0.5]), null, 'mirrored cameras are fine');
  assert.equal(angleProblem([0.5, 0.4, -0.4])[0], 0);
  assert.equal(angleProblem([0, 0.1, -0.4])[0], 1);
  assert.equal(angleProblem([0, 0.4, -0.1])[0], 2);
  assert.equal(angleProblem([0, 0.4, 0.4])[0], 2);
});
