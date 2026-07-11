import { describe, expect, it } from 'vitest';

import {
  asBool,
  asList,
  asObject,
  asString,
  isObject,
  mapObjects,
  nullableNumber,
  nullableString,
  stringList,
} from '../../src/support/data.js';

describe('data helpers', () => {
  it('asString returns only genuine strings', () => {
    expect(asString('x')).toBe('x');
    expect(asString(5)).toBe('');
    expect(asString(true)).toBe('');
    expect(asString(undefined, 'd')).toBe('d');
  });

  it('nullableString', () => {
    expect(nullableString('x')).toBe('x');
    expect(nullableString(5)).toBeNull();
    expect(nullableString(null)).toBeNull();
  });

  it('nullableNumber rejects booleans and non-numeric strings, truncates the rest', () => {
    expect(nullableNumber(true)).toBeNull();
    expect(nullableNumber(false)).toBeNull();
    expect(nullableNumber(null)).toBeNull();
    expect(nullableNumber('abc')).toBeNull();
    expect(nullableNumber('')).toBeNull();
    expect(nullableNumber('  ')).toBeNull();
    expect(nullableNumber('5')).toBe(5);
    expect(nullableNumber(5.9)).toBe(5);
    expect(nullableNumber('3.9')).toBe(3);
    expect(nullableNumber(9_007_199_254_740_991)).toBe(9_007_199_254_740_991);
  });

  it('nullableNumber returns null for values past the safe-integer range or non-finite', () => {
    // Beyond 2^53 a JS number has lost integer precision, so hydrate null (absence) rather than a
    // misleading value — mirrors the fixed-width siblings nulling out-of-range input.
    expect(nullableNumber(Number.MAX_SAFE_INTEGER + 2)).toBeNull(); // past 2^53, precision lost
    expect(nullableNumber(1e19)).toBeNull();
    expect(nullableNumber(-1e19)).toBeNull();
    expect(nullableNumber('9007199254740993')).toBeNull(); // Number() rounds this string
    expect(nullableNumber('1e19')).toBeNull();
    expect(nullableNumber(Infinity)).toBeNull();
    expect(nullableNumber(-Infinity)).toBeNull();
    expect(nullableNumber(NaN)).toBeNull();
  });

  it('asBool', () => {
    expect(asBool(true)).toBe(true);
    expect(asBool('true')).toBe(false);
    expect(asBool(undefined, true)).toBe(true);
  });

  it('asObject / isObject', () => {
    expect(asObject({ a: 1 })).toEqual({ a: 1 });
    expect(asObject([1, 2])).toEqual({});
    expect(asObject(null)).toEqual({});
    expect(isObject({})).toBe(true);
    expect(isObject([])).toBe(false);
    expect(isObject(null)).toBe(false);
  });

  it('asList passes arrays, reduces objects to values, else []', () => {
    expect(asList([1, 2])).toEqual([1, 2]);
    expect(asList({ a: 1, b: 2 })).toEqual([1, 2]);
    expect(asList('x')).toEqual([]);
    expect(asList(5)).toEqual([]);
  });

  it('mapObjects builds from object elements only', () => {
    const out = mapObjects([{ n: 1 }, 'skip', { n: 2 }], (o) => o.n);
    expect(out).toEqual([1, 2]);
  });

  it('stringList keeps only strings', () => {
    expect(stringList(['a', 1, 'b', null])).toEqual(['a', 'b']);
  });
});
