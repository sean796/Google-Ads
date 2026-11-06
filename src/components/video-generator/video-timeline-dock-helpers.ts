export function buildRulerTicks(totalSeconds: number): number[] {
  const step = totalSeconds <= 30 ? 5 : totalSeconds <= 60 ? 10 : 15;
  const ticks: number[] = [];
  for (let t = 0; t <= totalSeconds; t += step) {
    ticks.push(t);
  }
  if (ticks[ticks.length - 1] !== totalSeconds) {
    ticks.push(totalSeconds);
  }
  return ticks;
}
