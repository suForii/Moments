/** Checks that three selfies are really front, one side, then the other. Yaw is in radians. */
export function angleProblem([front, left, right]) {
  if (Math.abs(front) > 0.3) return [0, 'Face the camera straight on for "Front".'];
  if (Math.abs(left) < 0.2) return [1, 'Turn your head a little more for "Turn left".'];
  if (Math.abs(right) < 0.2) return [2, 'Turn your head a little more for "Turn right".'];
  // Cameras may mirror, so only the two sides being opposite matters.
  if (left * right > 0) return [2, 'Turn the other way for "Turn right".'];
  return null;
}
