'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
    Plus, 
    Trash2, 
    Link as LinkIcon, 
    Building2, 
    MapPin, 
    Check,
    Calendar,
    Settings,
    X,
    Save,
    Map as MapIcon, // not "Map": that would hide JavaScript's Map
    Edit,
    Lock,
    Loader2,
    Upload,
    Download
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { TableView } from "@/components/ui/table-view";
import { usePermission } from '@/hooks/usePermission';
import { readRouteSheet, matchRouteSheet, matchBlock, frequencyOf } from '@/utils/routeSheetImport';
import { searchRows } from '@/utils/tableSearch';

// A sheet list can be uploaded once it has a route with a branch (AFF NOs are looked up in that branch), days and facilities
const uploadable = (b: any) => Boolean(b.target?.branch_id && b.days.length && b.items.length);

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;
const ASSIGN_API = `${API_BASE}/api/keil/operations/assignments`;
const HCE_API = `${API_BASE}/api/keil/operations/hces`;
const ROUTE_API = `${API_BASE}/api/keil/operations/routes`;

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** This month in India, 'YYYY-MM'. */
const thisMonth = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 7);
/** 'YYYY-MM' or 'YYYY-MM-01' → "December 2026". */
const monthLabel = (m: string) => new Date(`${m.slice(0, 7)}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function RouteAssignmentsContent() {
    const searchParams = useSearchParams();
    const routeId = searchParams.get('route_id');
    const { success, error } = useToast();
    const { confirm } = useConfirm();
    const { hasPermission, loading: permissionLoading, user, isAdmin } = usePermission();

    // Route lists are kept per month. Admin and Manager Operations start each
    // month's plan and may change past months; others change this month and later.
    const isPlanner = isAdmin || (user?.role_name || user?.user_types?.name || '').trim().toLowerCase() === 'manager operations';
    const [month, setMonth] = useState(thisMonth());
    const [planMonth, setPlanMonth] = useState(''); // the month whose plan is shown ('YYYY-MM-01')
    const notStarted = Boolean(planMonth) && planMonth.slice(0, 7) !== month; // the chosen month shows another month's plan
    const isPast = month < thisMonth();
    const locked = notStarted || (isPast && !isPlanner);

    const canView = hasPermission('prod_assignment_view', 'view');
    const canCreate = hasPermission('prod_assignment_view', 'create') && !locked;
    const canEdit = hasPermission('prod_assignment_view', 'edit') && !locked;
    const canDelete = hasPermission('prod_assignment_view', 'delete') && !locked;

    const [route, setRoute] = useState<any>(null);
    const [routes, setRoutes] = useState<any[]>([]);
    const [selectedRouteId, setSelectedRouteId] = useState(routeId || '');
    const [assignments, setAssignments] = useState<any[]>([]);
    const [dayFilter, setDayFilter] = useState(''); // a list ("Tue & Fri"); '' shows them all
    const [availableHces, setAvailableHces] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAssigning, setIsAssigning] = useState(false);
    const [facilitySearch, setFacilitySearch] = useState('');
    const facilitySearchRef = useRef<HTMLInputElement>(null);
    const [editingAssignment, setEditingAssignment] = useState<any>(null);
    const [submitting, setSubmitting] = useState(false);
    // Bulk upload: the route sheet read and matched, and which of its lists to upload
    const [bulkOpen, setBulkOpen] = useState(false);
    const [bulkPlan, setBulkPlan] = useState<ReturnType<typeof matchRouteSheet> | null>(null);
    const [bulkPicked, setBulkPicked] = useState<Set<number>>(new Set());

    const [assignmentForm, setAssignmentForm] = useState({
        hce_id: '',
        collection_type: 'Daily',
        collection_days: DAYS,
        remarks: '',
        position: '' // SL NO in its days' list; empty adds it at the end
    });
    // Ticked facilities, to move to another route
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [moveTarget, setMoveTarget] = useState('');
    const [movePosition, setMovePosition] = useState('');

    useEffect(() => {
        fetchRoutesAndHces();
    }, []);

    useEffect(() => {
        setPicked(new Set());
        if (selectedRouteId) {
            fetchAssignments(selectedRouteId);
        } else {
            setRoute(null);
            setAssignments([]);
            setPlanMonth('');
        }
    }, [selectedRouteId, month]);

    const fetchRoutesAndHces = async () => {
        const token = localStorage.getItem('token');
        try {
            // Find KEIL company ID first
            const compRes = await fetch(`${API_BASE}/api/keil/companies`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const compData = await compRes.json();
            
            let coId = '';
            if (compData.success && Array.isArray(compData.data)) {
                const activeCo = compData.data.find((c: any) => 
                    c.company_name?.toUpperCase().includes('KEIL')
                );
                if (activeCo) coId = activeCo.id;
            }

            if (coId) {
                const [rRes, hRes] = await Promise.all([
                    fetch(`${ROUTE_API}?company_id=${coId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
                    fetch(`${HCE_API}?company_id=${coId}`, { headers: { 'Authorization': `Bearer ${token}` } })
                ]);

                const rData = await rRes.json();
                const hData = await hRes.json();

                if (rData.success) setRoutes(rData.data);
                if (hData.success) setAvailableHces(hData.data);
            }
        } catch (err) {
            console.error('Error fetching baseline data:', err);
        }
    };

    const fetchAssignments = async (id: string) => {
        setLoading(true);
        const token = localStorage.getItem('token');
        try {
            const [rRes, aRes] = await Promise.all([
                fetch(`${ROUTE_API}/${id}`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${ASSIGN_API}?route_id=${id}&month=${month}`, { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            const rData = await rRes.json();
            const aData = await aRes.json();

            if (rData.success) {
                setRoute(rData.data);
            } else {
                error("Failed to load route details.");
            }
            if (aData.success) {
                setAssignments(aData.data);
                setPlanMonth(aData.plan_month || '');
            } else {
                error(aData.message || 'Could not load the route list.');
            }
        } catch (err) {
            console.error('Error fetching record details:', err);
            error("Connection failed while fetching mapping data.");
        } finally {
            setLoading(false);
        }
    };

    const handleAssign = async (e: React.FormEvent) => {
        e.preventDefault();
        const token = localStorage.getItem('token');
        setSubmitting(true);
        try {
            const payload = {
                ...assignmentForm,
                position: Number(assignmentForm.position) || null,
                route_id: selectedRouteId,
                company_id: route?.company_id,
                plan_month: month
            };
            
            if (!payload.company_id || !payload.route_id) {
                error("Administrative context missing. Please wait for route data to sync.");
                return;
            }
            const res = await fetch(ASSIGN_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                success("HCE assigned to route.");
                resetForm();
                fetchAssignments(selectedRouteId);
            } else {
                error(data.message);
            }
        } catch (err: any) {
            error(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdate = async () => {
        const token = localStorage.getItem('token');
        setSubmitting(true);
        try {
            const res = await fetch(`${ASSIGN_API}/${editingAssignment.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify((({ position, ...rest }) => rest)(assignmentForm)) // a link keeps its place when edited
            });
            const data = await res.json();
            if (data.success) {
                success("Assignment updated.");
                setEditingAssignment(null);
                resetForm();
                fetchAssignments(selectedRouteId);
            } else {
                error(data.message || 'Could not update the assignment.');
            }
        } catch (err: any) {
            error(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleRemove = async (id: string) => {
        if (await confirm({ message: `Remove this HCE from the route in the ${monthLabel(month)} plan? The SL NOs after it move up to close the gap.` })) {
            const token = localStorage.getItem('token');
            try {
                const res = await fetch(`${ASSIGN_API}/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (data.success) {
                    success("HCE unlinked from route.");
                    fetchAssignments(selectedRouteId);
                } else {
                    error(data.message || 'Could not remove the facility.');
                }
            } catch (err: any) {
                error(err.message);
            }
        }
    };

    const readSheet = async (file: File) => {
        try {
            const ExcelJS = (await import('exceljs')).default;
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(await file.arrayBuffer());
            const plan = matchRouteSheet(readRouteSheet(workbook), routes, availableHces);
            if (!plan.length) {
                error('No route lists found. Each list needs SL NO, HCF NAME and AFF NO columns under a title such as "EKM 1 MONDAY&THURSDAY".');
                return;
            }
            setBulkPlan(plan);
            setBulkPicked(new Set(plan.flatMap((b, i) => (uploadable(b) ? [i] : []))));
        } catch (err: any) {
            error(`Could not read the file: ${err.message}`);
        }
    };

    const uploadSheet = async () => {
        if (!bulkPlan) return;
        const picked = bulkPlan.filter((b, i) => bulkPicked.has(i));
        const names = picked.map(b => `${b.target.route_name} ${b.days.map(d => d.slice(0, 3)).join(' & ')}`);
        const newHces = picked.reduce((n, b) => n + b.toRegister.length, 0);
        if (!(await confirm({ message: `${monthLabel(month)} plan: replace these lists with the sheet's lists, in the sheet's order: ${names.join(', ')}. Each becomes the route's whole list for its days: facilities on that route for those days are taken off them first, so none is listed twice; their other days stay.${newHces ? ` ${newHces} facilities not in the HCE Registry are added to it, with the sheet's name and AFF NO.` : ''}` }))) return;
        const token = localStorage.getItem('token');
        setSubmitting(true);
        let added = 0;
        try {
            for (const [i, b] of bulkPlan.entries()) {
                if (!bulkPicked.has(i)) continue;
                const res = await fetch(`${ASSIGN_API}/bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({
                        route_id: b.target.id,
                        company_id: b.target.company_id,
                        collection_days: b.days,
                        collection_type: frequencyOf(b.days),
                        items: b.items,
                        plan_month: month
                    })
                });
                const data = await res.json();
                if (!data.success) {
                    error(`${b.title || b.sheet}: ${data.message}`);
                    return;
                }
                added += b.items.length;
            }
            success(`Uploaded ${added} facilities.`);
            closeBulk();
        } catch (err: any) {
            error(err.message);
        } finally {
            setSubmitting(false);
            fetchRoutesAndHces(); // newly registered HCEs
            if (selectedRouteId) fetchAssignments(selectedRouteId);
        }
    };

    /** Start the chosen month's plan: every route's latest list is copied into it. */
    const startMonth = async () => {
        if (!route?.company_id) return;
        if (!(await confirm({ message: `Start the ${monthLabel(month)} route plan? Every route's list from ${monthLabel(planMonth)} is copied into ${monthLabel(month)}, where you can then move, add or remove facilities. Earlier months stay as they are.` }))) return;
        setSubmitting(true);
        try {
            const res = await fetch(`${ASSIGN_API}/start-month`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({ company_id: route.company_id, plan_month: month })
            });
            const data = await res.json();
            if (data.success) success(`${monthLabel(month)} plan started: ${data.data.copied} route links copied.`);
            else error(data.message || 'Could not start the month.');
        } catch (err: any) {
            error(err.message);
        } finally {
            setSubmitting(false);
            fetchAssignments(selectedRouteId);
        }
    };

    /** Undo a month started by mistake: its plan is removed and the month shows the one before it again. */
    const undoMonth = async () => {
        if (!route?.company_id) return;
        if (!(await confirm({ message: `Undo the start of the ${monthLabel(month)} plan? Its route lists, and any changes made in them, are removed for every route; ${monthLabel(month)} then shows the previous month's plan again. Earlier months stay as they are.` }))) return;
        setSubmitting(true);
        try {
            const res = await fetch(`${ASSIGN_API}/undo-month`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({ company_id: route.company_id, plan_month: month })
            });
            const data = await res.json();
            if (data.success) success(`The ${monthLabel(month)} plan start was undone.`);
            else error(data.message || 'Could not undo the month.');
        } catch (err: any) {
            error(err.message);
        } finally {
            setSubmitting(false);
            fetchAssignments(selectedRouteId);
        }
    };

    /** Move the ticked facilities to another route, keeping their days, from SL NO `movePosition` on (or at the end). */
    const moveSelected = async () => {
        const target = routes.find(r => r.id === moveTarget);
        if (!target || !picked.size) return;
        const at = Number(movePosition) || null;
        if (!(await confirm({ message: `Move ${picked.size} ${picked.size === 1 ? 'facility' : 'facilities'} from ${route?.route_name} to ${target.route_name} in the ${monthLabel(month)} plan${at ? `, from SL NO ${at}` : ', at the end of its list'}? They keep their collection days.` }))) return;
        setSubmitting(true);
        try {
            const res = await fetch(`${ASSIGN_API}/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({ ids: [...picked], route_id: target.id, position: at })
            });
            const data = await res.json();
            if (data.success) {
                success(`Moved ${data.data.moved} to ${target.route_name}.`);
                setPicked(new Set());
                setMoveTarget('');
                setMovePosition('');
            } else {
                error(data.message || 'Could not move the facilities.');
            }
        } catch (err: any) {
            error(err.message);
        } finally {
            setSubmitting(false);
            fetchAssignments(selectedRouteId);
        }
    };

    const closeBulk = () => {
        setBulkOpen(false);
        setBulkPlan(null);
        setBulkPicked(new Set());
    };

    const downloadTemplate = async () => {
        try {
            const ExcelJS = (await import('exceljs')).default;
            const saveAs = (await import('file-saver')).saveAs;
            const workbook = new ExcelJS.Workbook();
            const ws = workbook.addWorksheet('MON&THU');

            const activeRouteName = routes.find(r => r.id === selectedRouteId)?.route_name || 'MPM-2';
            
            // Row 1: Title (Route name + Days)
            ws.getCell('A1').value = `${activeRouteName} MONDAY&THURSDAY`;
            ws.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FF1E3A8A' } };

            // Row 2: Headers
            const headerRow = ws.getRow(2);
            headerRow.values = ['SL NO', 'HCF NAME', 'AFF NO'];
            headerRow.font = { bold: true };
            headerRow.eachCell(cell => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF1F5F9' }
                };
            });

            // Sample rows
            ws.addRow([1, 'TALUK HEADQUARTERS HOSPITAL', '101']);
            ws.addRow([2, 'COMMUNITY HEALTH CENTRE', '102']);
            ws.addRow([3, 'DISTRICT HOSPITAL', '103']);

            ws.columns = [
                { width: 10 },
                { width: 35 },
                { width: 16 }
            ];

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            saveAs(blob, `Route_Bulk_Upload_Template_${activeRouteName.replace(/[^A-Za-z0-9]/g, '_')}.xlsx`);
            success('Template downloaded! Fill it in and upload.');
        } catch (err: any) {
            error(`Could not download template: ${err.message}`);
        }
    };

    const resetForm = () => {
        setAssignmentForm({
            hce_id: '',
            collection_type: 'Daily',
            collection_days: DAYS,
            remarks: '',
            position: ''
        });
        setFacilitySearch('');
        setIsAssigning(false);
    };

    const toggleDay = (day: string) => {
        setAssignmentForm(prev => {
            const days = prev.collection_days.includes(day)
                ? prev.collection_days.filter(d => d !== day)
                : [...prev.collection_days, day];
            return { ...prev, collection_days: days };
        });
    };

    const setAllDays = () => {
        setAssignmentForm(prev => ({ ...prev, collection_days: DAYS }));
    };

    // A route's lists are its sets of days, as uploaded ("Tue & Fri"): the chosen
    // list's facilities, in route order (the order they were entered)
    const listOf = (a: any) => {
        const days = DAYS.filter(d => (a.collection_days || []).includes(d));
        return days.length === 7 ? 'Every day' : days.map(d => d.slice(0, 3)).join(' & ') || 'No days';
    };

    const dayOrder = (l: string) => {
        const firstWord = l.split('&')[0].trim().toLowerCase();
        const idx = DAYS.findIndex(d => d.toLowerCase().startsWith(firstWord));
        return idx >= 0 ? idx : 99;
    };

    const lists = [...new Set(assignments.map(listOf))].sort((a, b) => dayOrder(a) - dayOrder(b));
    const list = lists.includes(dayFilter) ? dayFilter : '';

    // Wherever common affiliation codes appear, arrange them strictly according to exact serial number order for each respective day
    const rawShown = list ? assignments.filter(a => listOf(a) === list) : assignments;
    const shown = [...rawShown].sort((a, b) => {
        if (!list) {
            const dayA = listOf(a);
            const dayB = listOf(b);
            if (dayA !== dayB) return dayOrder(dayA) - dayOrder(dayB);
        }
        const na = a.sl_no != null && !Number.isNaN(Number(a.sl_no)) ? Number(a.sl_no) : (a.sequence_order ?? Infinity);
        const nb = b.sl_no != null && !Number.isNaN(Number(b.sl_no)) ? Number(b.sl_no) : (b.sequence_order ?? Infinity);
        if (na !== nb) return na - nb;
        return (a.sequence_order ?? 0) - (b.sequence_order ?? 0);
    });

    const position = new Map(shown.map((a, i) => [a.id, i + 1]));
    // A list from a sheet is numbered by its SL NOs, so a skipped row leaves a gap; any other by place: 1, 2, 3...
    const numbered = Boolean(list) && shown.some(a => a.sl_no != null);
    const numberOf = (a: any): number => (numbered && a.sl_no != null ? a.sl_no : position.get(a.id) ?? 0);

    /**
     * Move a facility to number `to` in the list on screen: before the one now
     * numbered `to` when it moves up, after it when it moves down. The listed
     * facilities only swap places among themselves, so the other days' lists
     * keep their order; then the whole route is numbered 1, 2, 3... A sheet's
     * SL NOs stay, the moved facility taking `to`; if that is taken, the ones
     * in between move one along, as when moving a row in Excel.
     */
    const moveTo = async (link: any, to: number) => {
        const from = numberOf(link);
        const n = Math.round(to);
        if (Number.isNaN(n) || n < 1 || n === from) return;
        const up = n < from;
        const others = shown.filter(a => a !== link);
        const reordered = [...others];
        reordered.splice(others.filter(a => numberOf(a) < n || (!up && numberOf(a) === n)).length, 0, link);
        const onScreen = new Set(shown);
        let next = 0;
        const route = assignments.map(a => (onScreen.has(a) ? reordered[next++] : a));
        const slNo = new Map<any, number>();
        if (numbered) {
            slNo.set(link, n);
            if (others.some(a => numberOf(a) === n)) others.forEach(a => {
                const k = numberOf(a);
                if (up ? k >= n && k < from : k > from && k <= n) slNo.set(a, up ? k + 1 : k - 1);
            });
        }
        const items = route
            .map((a, i) => ({ id: a.id, sequence_order: i + 1, ...(slNo.has(a) ? { sl_no: slNo.get(a) } : {}) }))
            .filter((it, i) => route[i].sequence_order !== it.sequence_order || slNo.has(route[i]));
        try {
            const res = await fetch(`${ASSIGN_API}/reorder`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({ items })
            });
            const data = await res.json();
            if (!data.success) error(data.message || 'Could not change the order.');
        } catch (err: any) {
            error(err.message);
        }
        fetchAssignments(selectedRouteId);
    };

    // The facility list narrowed by the search box; the chosen one always stays listed.
    // A facility can be linked again: for other days, or on another route.
    const facilityMatches = searchRows(availableHces, facilitySearch, ['hce_name', 'hce_code']);
    const matchingHces = [...facilityMatches, ...availableHces.filter(h => h.id === assignmentForm.hce_id && !facilityMatches.includes(h))];

    if (permissionLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;

    if (!canView) return (
        <div className="h-[70vh] flex flex-col items-center justify-center space-y-4">
            <div className="p-6 rounded-full bg-primary/5 text-primary">
                <Lock className="w-12 h-12" />
            </div>
            <h2 className="text-2xl font-black text-primary uppercase tracking-tight">Access Restricted</h2>
            <p className="text-muted-foreground font-medium">You do not have permission to view the Route Mapping module.</p>
        </div>
    );

    return (
        <div className="md:p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-4 md:p-6 rounded-xl shadow-sm border border-primary/10">
                <div className="space-y-4 w-full md:w-auto">
                    <div className="space-y-1 text-center md:text-left">
                        <h1 className="text-2xl md:text-3xl font-bold text-primary tracking-tight font-heading">Route Mapping</h1>
                        <p className="text-xs md:text-sm font-medium text-muted-foreground">Assign facilities to active logistical loops.</p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="relative flex justify-center items-center group w-full sm:w-[300px]">
                            <MapIcon className="hidden md:block w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-primary/40 group-focus-within:text-primary transition-colors" />
                            <Select value={selectedRouteId} onValueChange={(val) => setSelectedRouteId(val)}>
                                <SelectTrigger className="md:pl-9 h-10 w-full border-primary/20 bg-background shadow-sm font-bold text-xs md:text-sm">
                                    <SelectValue placeholder="Switch / Select Route" />
                                </SelectTrigger>
                                <SelectContent className="bg-white border-primary/20">
                                    {routes.map(r => (
                                        <SelectItem key={r.id} value={r.id}>{r.route_name} ({r.route_code})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {route && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 rounded-md border border-primary/10 w-full sm:w-auto justify-center">
                                <span className="text-[10px] font-bold text-primary uppercase tracking-wider">{route.route_code}</span>
                                <span className="w-px h-3 bg-primary/20" />
                                <span className="text-[10px] md:text-xs font-bold text-muted-foreground">{route.branch_name}</span>
                            </div>
                        )}
                        <label className="flex items-center gap-2 w-full sm:w-auto">
                            <Calendar className="w-4 h-4 text-primary/60" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Plan month</span>
                            <Input
                                type="month"
                                value={month}
                                onChange={e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) setMonth(e.target.value); }}
                                className="h-10 w-[160px] border-primary/20 font-bold text-xs"
                            />
                        </label>
                    </div>
                    {selectedRouteId && planMonth && !notStarted && isPlanner && month > thisMonth() && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-primary/15 bg-primary/5 px-4 py-3 text-xs font-bold text-primary">
                            <span className="flex-1">The {monthLabel(month)} plan is started. Started by mistake? It can be undone until collections are saved in {monthLabel(month)}.</span>
                            <Button type="button" size="sm" variant="outline" onClick={undoMonth} disabled={submitting} className="h-8 rounded-full px-4 font-bold uppercase tracking-wider text-[10px] border-primary/30">
                                Undo {monthLabel(month)} start
                            </Button>
                        </div>
                    )}
                    {selectedRouteId && planMonth && (notStarted || isPast) && (
                        <div className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border px-4 py-3 text-xs font-bold ${notStarted ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-primary/15 bg-primary/5 text-primary'}`}>
                            <span className="flex-1">
                                {notStarted && month > planMonth.slice(0, 7) && <>The {monthLabel(month)} plan has not been started yet. Showing the {monthLabel(planMonth)} plan, view only.</>}
                                {notStarted && month < planMonth.slice(0, 7) && <>No route plan was kept before {monthLabel(planMonth)}. Showing that plan, view only.</>}
                                {!notStarted && isPast && (isPlanner
                                    ? <>{monthLabel(month)} is a past month. Changes here only change the {monthLabel(month)} plan.</>
                                    : <>{monthLabel(month)} is a past month: view only. Admin and Manager Operations can change it.</>)}
                            </span>
                            {notStarted && month > planMonth.slice(0, 7) && isPlanner && (
                                <Button type="button" size="sm" onClick={startMonth} disabled={submitting} className="h-8 rounded-full px-4 font-bold uppercase tracking-wider text-[10px]">
                                    {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                                    Start {monthLabel(month)} plan
                                </Button>
                            )}
                        </div>
                    )}
                    {selectedRouteId && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1">List</span>
                            {['', ...lists].map(l => (
                                <Button
                                    key={l || 'all'}
                                    type="button"
                                    size="sm"
                                    variant={list === l ? 'default' : 'outline'}
                                    onClick={() => setDayFilter(l)}
                                    className="h-8 px-3 text-xs font-bold"
                                >
                                    {l || 'All'}
                                    <span className="ml-1 opacity-60">
                                        {l ? assignments.filter(a => listOf(a) === l).length : assignments.length}
                                    </span>
                                </Button>
                            ))}
                        </div>
                    )}
                </div>
                {!isAssigning && !editingAssignment && !bulkOpen && canCreate && (
                    <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                        <Button
                            variant="outline"
                            onClick={() => setBulkOpen(true)}
                            className="w-full md:w-auto border-primary/20 text-primary px-6 rounded-full h-10 md:h-11 font-bold uppercase tracking-wider text-xs md:text-sm flex items-center justify-center gap-2"
                        >
                            <Upload className="w-4 h-4" /> Bulk Upload
                        </Button>
                        {selectedRouteId && (
                            <Button
                                onClick={() => setIsAssigning(true)}
                                className="w-full md:w-auto bg-primary hover:bg-primary/90 text-white px-8 rounded-full transition-all duration-300 shadow-lg shadow-primary/20 h-10 md:h-11 font-bold uppercase tracking-wider text-xs md:text-sm flex items-center justify-center gap-2 active:scale-95"
                            >
                                <LinkIcon className="w-4 h-4" />
                                <span className="hidden md:inline">Add HCE to Route</span>
                                <span className="md:hidden">Add HCE</span>
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {bulkOpen && (
                <Card className="border-primary/20 shadow-xl overflow-hidden rounded-xl">
                    <CardHeader className="bg-primary/5 border-b border-primary/10 py-6">
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-xl font-bold text-primary flex items-center gap-2">
                                <Upload className="w-5 h-5" /> Bulk Upload Route Lists
                            </CardTitle>
                            <Button variant="ghost" size="icon" onClick={closeBulk} className="text-primary/60 hover:text-primary">
                                <X className="w-5 h-5" />
                            </Button>
                        </div>
                        <CardDescription>
                            Uploads into the <b>{monthLabel(month)}</b> plan (change it with Plan month above).
                            Upload the route sheet (.xlsx): a sheet per set of days, each route as SL NO, HCF NAME and AFF NO columns
                            under a title such as &ldquo;EKM 1 MONDAY&amp;THURSDAY&rdquo;. Each ticked list replaces that route&rsquo;s list
                            for those days, in the sheet&rsquo;s order. Lists for other days stay as they are.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                            <Input
                                type="file"
                                accept=".xlsx"
                                onChange={e => { const file = e.target.files?.[0]; if (file) readSheet(file); e.target.value = ''; }}
                                className="h-11 border-primary/20 flex-1"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                onClick={downloadTemplate}
                                className="h-11 border-primary/30 hover:bg-primary/5 text-primary font-bold text-xs flex items-center justify-center gap-2 whitespace-nowrap px-4"
                            >
                                <Download className="w-4 h-4" /> Download Sample Template (.xlsx)
                            </Button>
                        </div>
                        {bulkPlan && (
                            <>
                                <div className="overflow-x-auto border border-primary/10 rounded-lg">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-primary/5 text-[10px] uppercase font-bold text-primary">
                                            <tr>
                                                <th className="p-3"></th>
                                                <th className="p-3">Sheet list</th>
                                                <th className="p-3">Route</th>
                                                <th className="p-3">Days</th>
                                                <th className="p-3 text-right">Facilities</th>
                                                <th className="p-3">New to HCE Registry</th>
                                                <th className="p-3">Skipped (no AFF NO)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bulkPlan.map((b, i) => (
                                                <tr key={i} className="border-t border-slate-100 align-top">
                                                    <td className="p-3">
                                                        <input
                                                            type="checkbox"
                                                            disabled={!uploadable(b)}
                                                            checked={bulkPicked.has(i)}
                                                            onChange={() => setBulkPicked(prev => {
                                                                const next = new Set(prev);
                                                                if (next.has(i)) next.delete(i); else next.add(i);
                                                                return next;
                                                            })}
                                                        />
                                                    </td>
                                                    <td className="p-3 font-bold">{b.title || b.sheet}</td>
                                                    <td className="p-3">
                                                        <select
                                                            value={b.target?.id || ''}
                                                            onChange={e => {
                                                                const next = matchBlock(b, routes.find(r => r.id === e.target.value), availableHces);
                                                                setBulkPlan(plan => plan && plan.map((p, j) => (j === i ? next : p)));
                                                                setBulkPicked(prev => {
                                                                    const picked = new Set(prev);
                                                                    if (uploadable(next)) picked.add(i); else picked.delete(i);
                                                                    return picked;
                                                                });
                                                            }}
                                                            className={`h-8 rounded-md border px-2 text-xs font-bold bg-white ${b.target ? 'border-primary/20' : 'border-destructive text-destructive'}`}
                                                        >
                                                            <option value="">{`Pick route for “${b.route}”`}</option>
                                                            {routes.map(r => (
                                                                <option key={r.id} value={r.id}>{r.route_name} ({r.branch_name || r.route_code})</option>
                                                            ))}
                                                        </select>
                                                        {b.target && !b.target.branch_id && (
                                                            <div className="mt-1 text-[11px] font-bold text-destructive">
                                                                No branch: set it in Route Registry first
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="p-3">
                                                        {b.days.length > 0 && (
                                                            <div className="font-bold text-xs mb-1">
                                                                {b.days.map((d: string) => d.slice(0, 3)).join(' & ')}
                                                            </div>
                                                        )}
                                                        <div className="flex flex-wrap gap-1">
                                                            {DAYS.map(d => {
                                                                const active = b.days.includes(d);
                                                                return (
                                                                    <button
                                                                        key={d}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const nextDays = active ? b.days.filter((x: string) => x !== d) : [...b.days, d];
                                                                            const next = { ...b, days: nextDays };
                                                                            setBulkPlan(plan => plan && plan.map((p, j) => (j === i ? next : p)));
                                                                            setBulkPicked(prev => {
                                                                                const picked = new Set(prev);
                                                                                if (uploadable(next)) picked.add(i); else picked.delete(i);
                                                                                return picked;
                                                                            });
                                                                        }}
                                                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                                                                            active ? 'bg-primary text-white border-primary' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                                                        }`}
                                                                    >
                                                                        {d.slice(0, 3)}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </td>
                                                    <td className="p-3 text-right font-bold">{b.items.length} of {b.rows.length}</td>
                                                    {[b.toRegister, b.missing].map((rows, k) => (
                                                        <td key={k} className="p-3">
                                                            {rows.length ? (
                                                                <details>
                                                                    <summary className={`cursor-pointer font-bold ${k ? 'text-destructive' : 'text-amber-700'}`}>{rows.length} rows</summary>
                                                                    <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                                                        {rows.map((r, j) => (
                                                                            <li key={j}>#{r.sl} {r.name || '(no name)'} {r.code ? `(AFF ${r.code})` : '(no AFF NO)'}</li>
                                                                        ))}
                                                                    </ul>
                                                                </details>
                                                            ) : '—'}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <Button
                                    onClick={uploadSheet}
                                    disabled={submitting || !bulkPicked.size}
                                    className="bg-primary hover:bg-primary/90 text-white px-8 rounded-full h-10 font-bold uppercase tracking-wider"
                                >
                                    {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                                    Upload {bulkPicked.size} {bulkPicked.size === 1 ? 'list' : 'lists'}
                                </Button>
                            </>
                        )}
                    </CardContent>
                </Card>
            )}

            {!bulkOpen && !selectedRouteId && (
                <div className="h-80 flex flex-col items-center justify-center bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200">
                    <MapIcon className="w-16 h-16 text-slate-200 mb-4" />
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No Route Selected</p>
                    <p className="text-[10px] text-slate-400 mt-1">Select a logistical loop from the dropdown above to manage facility mapping.</p>
                </div>
            )}

            {!bulkOpen && selectedRouteId && (
                <>

            {isAssigning || editingAssignment ? (
                <Card className="border-primary/20 shadow-xl animate-in slide-in-from-top duration-300 overflow-hidden rounded-xl">
                    <CardHeader className="bg-primary/5 border-b border-primary/10 py-6">
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-xl font-bold text-primary flex items-center gap-2">
                                <Settings className="w-5 h-5" />
                                {editingAssignment ? 'Update Assignment Parameters' : 'Link Facility to Route'}
                            </CardTitle>
                            <Button variant="ghost" size="icon" onClick={() => { setIsAssigning(false); setEditingAssignment(null); resetForm(); }} className="text-primary/60 hover:text-primary">
                                <X className="w-5 h-5" />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-8 px-8 pb-8">
                        <form onSubmit={editingAssignment ? (e) => { e.preventDefault(); handleUpdate(); } : handleAssign} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider pl-1">Select Facility</label>
                                    {editingAssignment ? (
                                        <div className="p-3 bg-muted rounded-md border border-primary/10">
                                            <p className="font-bold text-foreground">{editingAssignment.keil_hces?.hce_name}</p>
                                            <p className="text-[10px] text-muted-foreground uppercase">{editingAssignment.keil_hces?.hce_code}</p>
                                        </div>
                                    ) : (
                                        <Select
                                            value={assignmentForm.hce_id}
                                            onValueChange={(val) => setAssignmentForm({ ...assignmentForm, hce_id: val })}
                                            // Put the cursor in the search box as soon as the list opens
                                            onOpenChange={(open) => { if (open) setTimeout(() => facilitySearchRef.current?.focus(), 0); }}
                                        >
                                            <SelectTrigger className="h-10 w-full border-primary/20 bg-background shadow-sm font-bold">
                                                <SelectValue placeholder="Choose Hospital/Clinic" />
                                            </SelectTrigger>
                                            <SelectContent position="popper" className="bg-white border-primary/20 max-h-80">
                                                {/* Search inside the list: type part of a name or code. Keys stay in
                                                    the box instead of jumping the list by first letter. */}
                                                <div className="sticky top-0 z-10 bg-white p-1.5 border-b border-slate-100">
                                                    <Input
                                                        ref={facilitySearchRef}
                                                        value={facilitySearch}
                                                        onChange={(e) => setFacilitySearch(e.target.value)}
                                                        onKeyDown={(e) => e.stopPropagation()}
                                                        placeholder="Search facility name or code..."
                                                        className="h-8 text-sm border-primary/20"
                                                    />
                                                </div>
                                                {matchingHces.map(h => (
                                                    <SelectItem key={h.id} value={h.id}>{h.hce_name} ({h.hce_code})</SelectItem>
                                                ))}
                                                {matchingHces.length === 0 && (
                                                    <div className="px-3 py-2 text-xs text-muted-foreground">No facility matches &ldquo;{facilitySearch}&rdquo;</div>
                                                )}
                                            </SelectContent>
                                        </Select>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider pl-1">Collection Frequency</label>
                                    <Select 
                                        value={assignmentForm.collection_type} 
                                        onValueChange={(val) => {
                                            setAssignmentForm(prev => ({ 
                                                ...prev, 
                                                collection_type: val,
                                                collection_days: val === 'Daily' ? DAYS : prev.collection_days
                                            }));
                                        }}
                                    >
                                        <SelectTrigger className="h-10 w-full border-primary/20 bg-background shadow-sm font-bold">
                                            <SelectValue placeholder="Select Frequency" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border-primary/20">
                                            <SelectItem value="Daily">Daily</SelectItem>
                                            <SelectItem value="Alternate days">Alternate days</SelectItem>
                                            <SelectItem value="Thrice a Week">Thrice a Week</SelectItem>
                                            <SelectItem value="Once a Week">Once a Week</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {!editingAssignment && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider pl-1">Position (SL NO)</label>
                                        <Input
                                            type="number"
                                            min={1}
                                            value={assignmentForm.position}
                                            onChange={e => setAssignmentForm({ ...assignmentForm, position: e.target.value })}
                                            placeholder="Empty: at the end of the list"
                                            className="h-10 border-primary/20 font-bold"
                                        />
                                        <p className="text-[10px] text-muted-foreground pl-1">
                                            Its place in the list for the chosen days ({monthLabel(month)} plan). The facility now at that number, and those after it, move one down.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider pl-1">Days of Collection</label>
                                    <Button type="button" variant="ghost" className="text-[10px] h-6 font-bold text-primary" onClick={setAllDays}>Select All</Button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {DAYS.map(day => (
                                        <div 
                                            key={day}
                                            onClick={() => toggleDay(day)}
                                            className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-all ${
                                                assignmentForm.collection_days.includes(day) 
                                                ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20' 
                                                : 'bg-background border-primary/10 text-muted-foreground hover:border-primary/40'
                                            }`}
                                        >
                                            <div className={`w-4 h-4 rounded-sm border flex items-center justify-center ${assignmentForm.collection_days.includes(day) ? 'bg-white text-primary border-white' : 'border-primary/20'}`}>
                                                {assignmentForm.collection_days.includes(day) && <Check className="w-3 h-3 font-bold" />}
                                            </div>
                                            <span className="text-xs font-bold">{day}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-6 flex flex-col justify-between">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider pl-1">Remarks / Sequence Instructions</label>
                                    <textarea 
                                        className="flex min-h-[100px] w-full rounded-md border border-primary/20 bg-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                                        placeholder="Special entry instructions..."
                                        value={assignmentForm.remarks}
                                        onChange={e => setAssignmentForm({ ...assignmentForm, remarks: e.target.value })}
                                    />
                                </div>
                                <div className="flex gap-3">
                                    <Button 
                                        type="submit" 
                                        disabled={submitting}
                                        className="bg-primary hover:bg-primary/90 text-white px-8 rounded-full transition-all duration-300 shadow-lg shadow-primary/20 h-10 font-bold uppercase tracking-wider w-full"
                                    >
                                        {submitting ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                SAVING...
                                            </>
                                        ) : (
                                            <>
                                                <Save className="w-4 h-4 mr-2" /> 
                                                {editingAssignment ? 'Update Link' : 'Confirm Link'}
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            ) : (
                <>
                {canEdit && picked.size > 0 && (
                    <div className="flex flex-col md:flex-row md:items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                        <span className="text-xs font-bold text-primary flex-1">
                            {picked.size} ticked. Move to another route ({monthLabel(month)} plan); they keep their collection days.
                        </span>
                        <select
                            value={moveTarget}
                            onChange={e => setMoveTarget(e.target.value)}
                            className="h-9 rounded-md border border-primary/20 bg-white px-2 text-xs font-bold"
                        >
                            <option value="">Move to route...</option>
                            {routes.filter(r => r.id !== selectedRouteId).map(r => (
                                <option key={r.id} value={r.id}>{r.route_name} ({r.route_code})</option>
                            ))}
                        </select>
                        <Input
                            type="number"
                            min={1}
                            value={movePosition}
                            onChange={e => setMovePosition(e.target.value)}
                            placeholder="From SL NO (empty: at the end)"
                            className="h-9 w-full md:w-[210px] border-primary/20 text-xs font-bold"
                        />
                        <Button type="button" size="sm" onClick={moveSelected} disabled={!moveTarget || submitting} className="h-9 rounded-full px-5 font-bold uppercase tracking-wider text-[10px]">
                            {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <MapIcon className="w-3.5 h-3.5 mr-1.5" />} Move
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setPicked(new Set())} className="h-9 text-xs">Clear</Button>
                    </div>
                )}
                <TableView
                    key={list}
                    title="Mapped Facilities"
                    description={`Collection sequence for ${route?.route_name}, ${monthLabel(planMonth || month)} plan${list ? `, ${list} list` : ''}${canEdit ? '. Type a new number to move a facility.' : ''}`}
                    headers={['HCE / Place', 'Type', 'Collection Days', 'Remarks', 'Actions']}
                    data={shown}
                    initialRowsPerPage={100}
                    loading={loading}
                    searchFields={['keil_hces.hce_name', 'keil_hces.hce_code', 'keil_hces.hce_place']}
                    renderRow={(a: any) => (
                        <tr key={a.id} className="hover:bg-primary/[0.02] transition-colors group border-b last:border-0 border-slate-100">
                            <td className="px-6 py-6">
                                <div className="flex items-center gap-3">
                                    {canEdit && (
                                        <input
                                            type="checkbox"
                                            aria-label={`Tick ${a.keil_hces?.hce_name || 'facility'} to move it to another route`}
                                            checked={picked.has(a.id)}
                                            onChange={() => setPicked(prev => {
                                                const next = new Set(prev);
                                                if (next.has(a.id)) next.delete(a.id); else next.add(a.id);
                                                return next;
                                            })}
                                            className="w-4 h-4 accent-primary"
                                        />
                                    )}
                                    {canEdit ? (
                                        <input
                                            key={`${a.id}-${numberOf(a)}`}
                                            type="number"
                                            min={1}
                                            defaultValue={numberOf(a)}
                                            title="Type a new number and press Enter to move this facility"
                                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                            onBlur={e => moveTo(a, Number(e.target.value))}
                                            className="w-12 h-8 rounded-lg bg-primary/10 text-center text-xs font-black text-primary shadow-sm border border-primary/10 focus:outline-none focus:ring-2 focus:ring-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                    ) : (
                                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-black text-primary shadow-sm border border-primary/10">
                                            {numberOf(a)}
                                        </div>
                                    )}
                                    <div className="flex flex-col">
                                        <span className="font-bold text-foreground text-sm truncate max-w-[200px]" title={a.keil_hces?.hce_name}>{a.keil_hces?.hce_name}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-muted-foreground/70 uppercase font-medium truncate max-w-[100px]" title={a.keil_hces?.hce_code}>{a.keil_hces?.hce_code}</span>
                                            <span className="w-1 h-1 rounded-full bg-muted-foreground/20" />
                                            <span className="text-[10px] font-bold text-secondary uppercase tracking-tight">{a.keil_hces?.hce_place}</span>
                                        </div>
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-6 min-w-[200px]">
                                <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full border border-emerald-100 whitespace-nowrap">{a.collection_type}</span>
                            </td>
                            <td className="px-6 py-6">
                                <div className="flex flex-wrap gap-1.5 max-w-[200px]">
                                    {(Array.isArray(a.collection_days) ? a.collection_days : []).map((day: string) => (
                                        <span key={day} className="text-[9px] font-bold bg-muted text-muted-foreground px-2 py-1 rounded-md border border-muted-foreground/5 shadow-sm">{day.slice(0, 3)}</span>
                                    ))}
                                    {(!a.collection_days || a.collection_days.length === 0) && <span className="text-[10px] font-medium text-slate-400 italic">None selected</span>}
                                </div>
                            </td>
                            <td className="px-6 py-6 text-[10px] font-bold text-muted-foreground/70 max-w-[150px] truncate italic">{a.remarks}</td>
                            <td className="px-6 py-6 text-right">
                                <div className="flex items-center justify-end gap-2">
                                    {canEdit && (
                                        <Button variant="ghost" size="icon" className="h-10 w-10 text-primary/60 hover:text-primary hover:bg-primary/10 rounded-xl transition-all border border-transparent hover:border-primary/10" onClick={() => {
                                            setEditingAssignment(a);
                                            setAssignmentForm({
                                                hce_id: a.hce_id,
                                                collection_type: a.collection_type || 'Daily',
                                                collection_days: a.collection_days || [],
                                                remarks: a.remarks || '',
                                                position: ''
                                            });
                                        }}>
                                            <Edit className="w-4 h-4" />
                                        </Button>
                                    )}
                                    {canDelete && (
                                        <Button variant="ghost" size="icon" onClick={() => handleRemove(a.id)} className="h-10 w-10 text-destructive/60 hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all border border-transparent hover:border-destructive/10">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    )}
                />
                </>
            )}
            </>
            )}
        </div>
    );
}

export default function RouteAssignmentsPage() {
    return (
        <Suspense fallback={<div className="p-10 text-center">Loading mapping console...</div>}>
            <RouteAssignmentsContent />
        </Suspense>
    );
}
