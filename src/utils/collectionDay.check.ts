/**
 * Self-check for a date's collection list. From the frontend folder:
 *
 *   npx tsx src/utils/collectionDay.check.ts
 */
import assert from 'assert';
import { dayList, onePerFacility } from './collectionDay';

const MT = ['Monday', 'Thursday'], TF = ['Tuesday', 'Friday'], WS = ['Wednesday', 'Saturday'];
// ALP-1 style: AFF 637 is on all three lists, each with its own SL NO
const links = [
    { id: 'mt1', hce_id: '637', collection_days: MT, sl_no: 1, sequence_order: 1 },
    { id: 'mt2', hce_id: '641', collection_days: MT, sl_no: 2, sequence_order: 2 },
    { id: 'mt3', hce_id: '639', collection_days: MT, sl_no: 3, sequence_order: 3 },
    { id: 'tf1', hce_id: '678', collection_days: TF, sl_no: 1, sequence_order: 4 },
    { id: 'tf5', hce_id: '637', collection_days: TF, sl_no: 5, sequence_order: 5 },
    { id: 'tf7', hce_id: '641', collection_days: TF, sl_no: 7, sequence_order: 6 },
    { id: 'ws1', hce_id: '637', collection_days: WS, sl_no: 1, sequence_order: 7 },
    { id: 'ws9', hce_id: '999', collection_days: WS, sl_no: 9, sequence_order: 8 },
];
const ids = (l: any[]) => l.map(a => a.id);
const all = new Set(links.map(a => a.hce_id));

assert.deepStrictEqual(ids(dayList(links, 'Monday', new Set(), false)), ['mt1', 'mt2', 'mt3'], 'Monday: only the Mon & Thu list');
assert.deepStrictEqual(ids(dayList(links, 'Monday', all, false)), ['mt1', 'mt2', 'mt3', 'tf1', 'ws9'],
    'Monday with everything visited: shared codes (637, 641) are not pulled in from other lists; '
    + 'only facilities on no Monday list (678, 999) are added, once each, after the list');
assert.deepStrictEqual(ids(dayList(links, 'Tuesday', new Set(['637']), false)), ['tf1', 'tf5', 'tf7'], 'Tuesday: the Tue & Fri list only; 637 shows as #5 of it');
assert.deepStrictEqual(dayList(links, 'Sunday', new Set(['637']), false).length, 1, 'a visited facility with no link due is listed once');
assert.strictEqual(dayList(links, 'Monday', new Set(), true).length, links.length, 'Show all days lists every link');
assert.deepStrictEqual(onePerFacility([{ hce_id: 'a', sl_no: 1 }, { hce_id: 'b', sl_no: 2 }, { hce_id: 'a', sl_no: 5 }]),
    [{ hce_id: 'a', sl_no: 1 }, { hce_id: 'b', sl_no: 2 }], 'saved once per facility, first SL NO kept');

console.log('collection-day: all checks passed');
