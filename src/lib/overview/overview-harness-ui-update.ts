export function deferHarnessUiUpdate(fn: () => void): void {
  fn();
}
