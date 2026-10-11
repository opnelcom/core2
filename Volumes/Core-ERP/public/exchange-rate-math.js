(function (root, factory) {
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.ExchangeRateMath = value;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const scale = 100000000n;
  function normalise(value) {
    if (typeof value !== 'string') throw new Error('Enter the rate as a decimal value');
    const text = value.trim();
    if (!/^\d{1,20}(?:\.\d{1,8})?$/.test(text)) throw new Error('Use a positive rate with at most 20 whole digits and 8 decimal places');
    const [whole, fraction = ''] = text.split('.');
    const units = BigInt(whole) * scale + BigInt(fraction.padEnd(8, '0'));
    if (units === 0n) throw new Error('Rate must be greater than zero');
    return `${BigInt(whole)}.${fraction.padEnd(8, '0')}`;
  }
  function reciprocal(value) {
    const units = BigInt(normalise(value).replace('.', ''));
    const rounded = (scale * scale + units / 2n) / units;
    if (rounded === 0n) return '< 0.00000001';
    return `${rounded / scale}.${String(rounded % scale).padStart(8, '0')}`;
  }
  return { normalise, reciprocal };
});
