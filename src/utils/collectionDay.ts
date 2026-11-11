/**
 * A date's facilities on a route, in SL NO order. Each link (a facility on one
 * day list) is listed by its own days only, so lists that share an AFF NO
 * (Mon & Thu #1, Tue & Fri #5) never mix. A visited facility with no link due
 * that day (its days changed after the visit was saved) is listed once.
 */
export function dayList<T extends { id: string; hce_id: string; collection_days?: string[] | null; sl_no?: any; sequence_order?: number | null }>(
    links: T[], weekday: string, visitedIds: Set<string>, showAll: boolean
): T[] {
    const isDue = (a: T) => showAll || !(a.collection_days || []).length || (a.collection_days || []).includes(weekday);
    const due = links.filter(isDue);
    const dueIds = new Set(due.map(a => a.hce_id));
    const kept = new Set<string>();
    const visitedOffList = links.filter(a => {
        if (isDue(a) || !visitedIds.has(a.hce_id) || dueIds.has(a.hce_id) || kept.has(a.hce_id)) return false;
        kept.add(a.hce_id);
        return true;
    });
    const num = (a: T) => (a.sl_no != null && !Number.isNaN(Number(a.sl_no)) ? Number(a.sl_no) : (a.sequence_order ?? Infinity));
    const bySlNo = (a: T, b: T) => num(a) - num(b) || (a.sequence_order ?? 0) - (b.sequence_order ?? 0);
    // Off-list visits go after the day's list: their SL NOs belong to other lists
    return [...due.sort(bySlNo), ...visitedOffList.sort(bySlNo)];
}

/** One saved row per facility: a facility shown twice keeps its first row (and SL NO). */
export function onePerFacility<T extends { hce_id: string }>(rows: T[]): T[] {
    const seen = new Set<string>();
    return rows.filter(r => !seen.has(r.hce_id) && !!seen.add(r.hce_id));
}
