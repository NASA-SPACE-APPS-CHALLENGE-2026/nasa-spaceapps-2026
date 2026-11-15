import { describe, expect, it } from 'vitest';
import { parseRecordFile } from '@/lib/import/recordFile';

describe('farm record imports', () => {
  it('retains quoted newlines, escaped quotes, leading zeros and source attribution', () => {
    const [row] = parseRecordFile('ledger.csv', '\uFEFFid,source,note,amount\r\n001,"Co-op, West","Line 1\r\n""paid""",5\r\n');
    expect(row).toEqual({ id: '001', source: 'Co-op, West', note: 'Line 1\r\n"paid"', amount: '5', importSource: 'ledger.csv, record 1' });
  });
  it('reads list values and keeps empty quantities empty', () => {
    const [row] = parseRecordFile('fields.csv', 'id,currentRotation,usableAcres\na,"[""corn"",""soybeans""]",');
    expect(row.currentRotation).toEqual(['corn', 'soybeans']);
    expect(row.usableAcres).toBeUndefined();
    expect(row.source).toBe('fields.csv, record 1');
    expect(parseRecordFile('notes.csv', 'id,source\n001,[field notebook]')[0].source).toBe('[field notebook]');
  });
  it.each(['id,id\na,b', 'id,\na,b', 'id,note\na,x,z', 'id\n"a', 'id\n"a"b'])('rejects malformed CSV without saving a partial file', text => {
    expect(() => parseRecordFile('bad.csv', text)).toThrow();
  });
  it('retains original JSON columns and rejects malformed record collections', () => {
    expect(parseRecordFile('a.json', '[{"id":"x","notes":{"n":1}}]')[0].notes).toEqual({ n: 1 });
    for (const text of ['{}', '[]', '[null]', '[[]]', '[1]']) expect(() => parseRecordFile('a.json', text)).toThrow();
  });
});
