// SLA, priority score and schedule projection. Pure functions, computed on read.
import { addWorkdays, daysUntil, workdaysBetween } from "./time";
import {
  stageDef, stagesFor, type DocStatus, type DocType, type RiskLevel, type StageDef,
} from "./workflow";
import type { AppSettings } from "./db";

export interface DocRow {
  id: number;
  code: string;
  title: string;
  doc_type: DocType;
  counterparty: string | null;
  contract_value: string | number | null;
  currency: string;
  deadline: string | Date | null;
  urgent: boolean;
  risk_level: RiskLevel;
  skip_stages?: string[];
  require_cpo: boolean | null;
  stage: string;
  status: DocStatus;
  hold_reason: string | null;
  assignee_id: number | null;
  assignee_name?: string | null;
  requester_name: string | null;
  requester_email: string | null;
  summary: string | null;
  key_points: string[];
  ai_suggestion: AiSuggestion | null;
  source: string;
  stage_entered_at: string | Date;
  hold_started_at: string | Date | null;
  paused_ms: string | number;
  last_activity_at: string | Date;
  completed_at: string | Date | null;
  is_demo: boolean;
  created_at: string | Date;
}

export interface AiSuggestion {
  stage?: string | null;
  hold?: boolean;
  reason: string;
  emailId?: number;
  at: string;
}

export type PriorityLevel = "P1" | "P2" | "P3" | "P4";

export interface Factor { label: string; points: number }

export interface Insight {
  stages: StageDef[];
  stage: StageDef | undefined;
  stageIndex: number;
  /** working days spent in the current stage (SLA clock, excludes holds) */
  slaUsed: number;
  slaDays: number;
  slaRatio: number;
  slaState: "ok" | "warn" | "breach" | "paused" | "closed";
  deadline: string | null;
  daysToDeadline: number | null;
  projectedFinish: number | null;
  latePrediction: boolean;
  plan: { key: string; label: string; due: number | null; state: "done" | "current" | "upcoming" }[];
  score: number;
  level: PriorityLevel;
  factors: Factor[];
}

export const value = (d: DocRow) => (d.contract_value === null || d.contract_value === "" ? null : Number(d.contract_value));
export const deadlineStr = (d: DocRow) =>
  d.deadline === null ? null : typeof d.deadline === "string" ? d.deadline.slice(0, 10) : wibIso(d.deadline);
const wibIso = (d: Date) => new Date(+d + 7 * 3600_000).toISOString().slice(0, 10);

export function stageCtx(d: DocRow, s: AppSettings) {
  return { contractValue: value(d), riskLevel: d.risk_level, requireCpo: d.require_cpo, cpoThreshold: s.cpoThreshold, skip: d.skip_stages ?? [] };
}

export function insight(d: DocRow, s: AppSettings, now = Date.now()): Insight {
  const holidays = new Set(s.holidays);
  const stages = stagesFor(s.workflows, d.doc_type, stageCtx(d, s), d.stage);
  const stage = stageDef(s.workflows, d.doc_type, d.stage);
  const stageIndex = stages.findIndex((x) => x.key === d.stage);
  const closed = d.status === "done" || d.status === "cancelled";
  const paused = d.status === "on_hold";

  const entered = +new Date(d.stage_entered_at);
  const clockEnd = paused && d.hold_started_at ? +new Date(d.hold_started_at) : now;
  const pausedMs = Number(d.paused_ms) || 0;
  const slaUsed = closed ? 0 : Math.max(0, workdaysBetween(entered, clockEnd, holidays) - pausedMs / 86_400_000);
  const slaDays = stage?.slaDays ?? 1;
  const slaRatio = slaUsed / slaDays;
  const slaState: Insight["slaState"] = closed ? "closed" : paused ? "paused" : slaRatio >= 1 ? "breach" : slaRatio >= 0.75 ? "warn" : "ok";

  // Schedule: remaining time in current stage + SLA of every later stage.
  const plan: Insight["plan"] = [];
  let cursor = now;
  let projectedFinish: number | null = null;
  if (!closed) {
    stages.forEach((st, i) => {
      if (stageIndex >= 0 && i < stageIndex) {
        plan.push({ key: st.key, label: st.label, due: null, state: "done" });
        return;
      }
      if (i === stageIndex) {
        const remaining = Math.max(0.25, slaDays - slaUsed);
        cursor = addWorkdays(cursor, remaining, holidays);
        plan.push({ key: st.key, label: st.label, due: cursor, state: "current" });
        return;
      }
      cursor = addWorkdays(cursor, st.slaDays, holidays);
      plan.push({ key: st.key, label: st.label, due: cursor, state: "upcoming" });
    });
    projectedFinish = cursor;
  } else {
    stages.forEach((st) => plan.push({ key: st.key, label: st.label, due: null, state: "done" }));
  }

  const dl = deadlineStr(d);
  const daysToDeadline = dl ? daysUntil(dl, now) : null;
  const latePrediction = Boolean(!closed && dl && projectedFinish && projectedFinish > Date.parse(dl + "T16:59:59Z"));

  // Priority score — every point is explainable.
  const factors: Factor[] = [];
  if (!closed) {
    if (daysToDeadline === null) factors.push({ label: "Tanpa deadline", points: 8 });
    else if (daysToDeadline < 0) factors.push({ label: `Deadline lewat ${-daysToDeadline} hari`, points: 40 });
    else if (daysToDeadline <= 3) factors.push({ label: `Deadline ${daysToDeadline} hari lagi`, points: 34 });
    else if (daysToDeadline <= 7) factors.push({ label: `Deadline ${daysToDeadline} hari lagi`, points: 24 });
    else if (daysToDeadline <= 14) factors.push({ label: `Deadline ${daysToDeadline} hari lagi`, points: 14 });
    else factors.push({ label: `Deadline ${daysToDeadline} hari lagi`, points: 5 });

    const v = value(d);
    if (v !== null) {
      if (v >= 5e9) factors.push({ label: "Nilai ≥ Rp5 M", points: 20 });
      else if (v >= 1e9) factors.push({ label: "Nilai ≥ Rp1 M", points: 15 });
      else if (v >= 2.5e8) factors.push({ label: "Nilai ≥ Rp250 jt", points: 9 });
      else factors.push({ label: "Nilai < Rp250 jt", points: 4 });
    }

    factors.push({ label: d.doc_type === "principal" ? "Kontrak prinsipal" : d.doc_type === "vendor" ? "Kontrak vendor" : "Dokumen lain", points: d.doc_type === "principal" ? 10 : d.doc_type === "vendor" ? 7 : 3 });
    if (d.risk_level === "high") factors.push({ label: "Risiko tinggi", points: 10 });
    else if (d.risk_level === "medium") factors.push({ label: "Risiko sedang", points: 4 });
    if (d.urgent) factors.push({ label: "Ditandai urgent", points: 12 });
    if (slaState === "breach") factors.push({ label: "SLA tahap terlewati", points: 14 });
    else if (slaState === "warn") factors.push({ label: "SLA tahap hampir habis", points: 7 });
    if (latePrediction) factors.push({ label: "Proyeksi melewati deadline", points: 8 });
  }
  const score = Math.min(100, factors.reduce((a, f) => a + f.points, 0));
  const level: PriorityLevel = score >= 70 ? "P1" : score >= 50 ? "P2" : score >= 30 ? "P3" : "P4";

  return { stages, stage, stageIndex, slaUsed, slaDays, slaRatio, slaState, deadline: dl, daysToDeadline, projectedFinish, latePrediction, plan, score, level, factors };
}

export const LEVEL_LABEL: Record<PriorityLevel, string> = { P1: "Kritis", P2: "Tinggi", P3: "Sedang", P4: "Rendah" };
