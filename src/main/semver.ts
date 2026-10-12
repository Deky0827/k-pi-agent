/** Small strict semver helper; package versions used here never need ranges. */
export function compareVersions(left: string, right: string): number {
  const parse = (value: string): number[] => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value);
    if (!match) throw new Error(`Unsupported version: ${value}`);
    return match.slice(1).map(Number);
  };

  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}
