// Document journey: who held each step, for how long, and who is holding it now.
import { workdaysBetween } from "./time";
import { insight, type DocRow, type Insight } from "./insight";
import type { AppSettings } from "./db";
import type { EventRow, Member } from "./repo";
import { ROLE_LABEL, stageDef, type Role } from "./workflow";

export type StepState = "done" | "current" | "waiting" | "upcoming";

export interface JourneyStep {
  key: string;
  label: string;
  /** Short label for compact trackers. */
  short: string;
  role: Role;
  approval: boolean;
  owner: string;
  state: StepState;
  startedAt: number | null;
  endedAt: number | null;
  /** working days spent (all visits) */
  spent: number;
  target: number;
  late: boolean;
  dueAt: number | null;
  visits: number;
}

export interface Holder {
  key: string;
  name: string;
  sub: string;
  kind: "person" | "role" | "external" | "none";
}

export interface Journey {
  ins: Insight;
  steps: JourneyStep[];
  current: JourneyStep | null;
  holder: Holder;
  doneCount: number;
  /** working days the current holder has had it */
  waiting: number;
  overBy: number;
  closed: boolean;
}

const SHORT: Record<string, string> = {
  intake: "Diterima",
  due_diligence: "Due diligence",
  review: "Review",
  negotiation: "Negosiasi",
  mgr_approval: "Manager",
  agm_approval: "AGM",
  cpo_approval: "CPLO",
  signing: "Tanda tangan",
  archive: "Arsip",
};

const TRANSITIONS = new Set(["stage", "approved", "revision", "moved"]);

function ownerOf(doc: DocRow, role: Role, approval: boolean, members: Member[]): { name: string; kind: Holder["kind"] } {
  if (approval) {
    const people = members.filter((m) => m.active && m.role === role);
    if (people.length === 1) return { name: people[0].name, kind: "person" };
    return { name: ROLE_LABEL[role], kind: "role" };
  }
  if (doc.assignee_name) return { name: doc.assignee_name, kind: "person" };
  return { name: "Belum ada PIC", kind: "none" };
}

export function buildJourney(doc: DocRow, events: EventRow[], members: Member[], s: AppSettings, now = Date.now()): Journey {
  const ins = insight(doc, s, now);
  const holidays = new Set(s.holidays);
  const closed = doc.status === "done" || doc.status === "cancelled";

  // Reconstruct visits from transition events (ascending).
  const trans = events
    .filter((e) => TRANSITIONS.has(e.type) && e.to_stage)
    .map((e) => ({ from: e.from_stage, to: e.to_stage!, at: +new Date(e.created_at) }))
    .sort((a, b) => a.at - b.at);
  const visits: { stage: string; start: number; end: number | null }[] = [];
  if (trans.length) {
    visits.push({ stage: trans[0].from ?? "intake", start: +new Date(doc.created_at), end: trans[0].at });
    trans.forEach((t, i) => visits.push({ stage: t.to, start: t.at, end: trans[i + 1]?.at ?? null }));
  } else {
    visits.push({ stage: doc.stage, start: +new Date(doc.stage_entered_at), end: null });
  }
  const last = visits[visits.length - 1];
  if (last.stage === doc.stage) last.start = +new Date(doc.stage_entered_at);
  if (closed && last.end === null) last.end = doc.completed_at ? +new Date(doc.completed_at) : now;

  const curIdx = ins.stageIndex;
  const steps: JourneyStep[] = ins.stages.map((st, i) => {
    const mine = visits.filter((v) => v.stage === st.key);
    const owner = ownerOf(doc, st.role, Boolean(st.approval), members);
    let state: StepState = closed ? "done" : i < curIdx ? "done" : i === curIdx ? (doc.status === "on_hold" ? "waiting" : "current") : "upcoming";
    if (closed && doc.status === "cancelled" && i > curIdx) state = "upcoming";
    const isCurrent = state === "current" || state === "waiting";
    const spent = isCurrent
      ? ins.slaUsed + mine.filter((v) => v.end !== null).reduce((a, v) => a + workdaysBetween(v.start, v.end!, holidays), 0)
      : mine.reduce((a, v) => a + workdaysBetween(v.start, v.end ?? now, holidays), 0);
    const plan = ins.plan[i];
    return {
      key: st.key,
      label: st.label,
      short: SHORT[st.key] ?? st.label,
      role: st.role,
      approval: Boolean(st.approval),
      owner: owner.name,
      state,
      startedAt: mine.length ? mine[0].start : null,
      endedAt: state === "done" && mine.length ? mine[mine.length - 1].end : null,
      spent,
      target: st.slaDays,
      late: isCurrent ? ins.slaState === "breach" : state === "done" && mine.length > 0 && spent > st.slaDays + 0.05,
      dueAt: !closed && plan?.due ? plan.due : null,
      visits: mine.length,
    };
  });

  const current = closed ? null : steps.find((x) => x.state === "current" || x.state === "waiting") ?? null;
  let holder: Holder;
  if (closed) holder = { key: "closed", name: doc.status === "done" ? "Selesai" : "Dibatalkan", sub: "", kind: "none" };
  else if (doc.status === "on_hold") holder = { key: `ext`, name: doc.counterparty || "Pihak luar", sub: "Menunggu balasan pihak luar", kind: "external" };
  else if (current) {
    const o = ownerOf(doc, current.role, current.approval, members);
    holder = { key: `${o.kind}:${o.name}`, name: o.name, sub: current.approval ? `Persetujuan ${ROLE_LABEL[current.role]}` : current.label, kind: o.kind };
  } else holder = { key: "none", name: "—", sub: "", kind: "none" };

  return {
    ins,
    steps,
    current,
    holder,
    doneCount: steps.filter((x) => x.state === "done").length,
    waiting: closed ? 0 : ins.slaUsed,
    overBy: Math.max(0, ins.slaUsed - ins.slaDays),
    closed,
  };
}

/** Does this member need to act on the document right now? */
export function needsMe(doc: DocRow, me: Member): boolean {
  if (doc.status !== "active") return false;
  const st = stageDef(doc.doc_type, doc.stage);
  if (!st) return false;
  if (st.approval) return me.role === st.role;
  if (doc.assignee_id === me.id) return true;
  return !doc.assignee_id && (me.role === "manager" || me.role === "admin");
}

export interface HolderLoad {
  holder: Holder;
  count: number;
  late: number;
  longest: number;
  docIds: number[];
}

export function holderLoads(js: { doc: DocRow; j: Journey }[]): HolderLoad[] {
  const map = new Map<string, HolderLoad>();
  for (const { doc, j } of js) {
    if (j.closed) continue;
    const key = j.holder.kind === "external" ? "ext" : j.holder.key;
    const h = map.get(key) ?? { holder: j.holder.kind === "external" ? { key: "ext", name: "Pihak luar", sub: "Vendor / prinsipal", kind: "external" as const } : j.holder, count: 0, late: 0, longest: 0, docIds: [] };
    h.count++;
    if (j.ins.slaState === "breach") h.late++;
    h.longest = Math.max(h.longest, j.waiting);
    h.docIds.push(doc.id);
    map.set(key, h);
  }
  return [...map.values()].sort((a, b) => b.late - a.late || b.count - a.count);
}
