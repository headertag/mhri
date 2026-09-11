const numerals = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
  [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
] as const;

export function toRomanYear(year: number): string {
  let remaining = year;
  let result = '';
  for (const [value, numeral] of numerals) {
    result += numeral.repeat(Math.floor(remaining / value));
    remaining %= value;
  }
  return result;
}
