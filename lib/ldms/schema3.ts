// Schema v11: Data Record › Cases (+ handling steps & documents), SIGAP results, the employee cache that powers
// grade cohorts, and KB entries sourced from Cases / SIGAP. Idempotent, safe on a v10 database.
export const LDMS_MIGRATION_V11 = [
  // Non-Legal employees log in as role "viewer"; what they see comes from the cohorts in Admin Console.
  `alter table team_members drop constraint if exists team_members_role_check`,
  `alter table team_members add constraint team_members_role_check check (role in ('staff','supervisor','manager','agm','cpo','admin','viewer'))`,
  `alter table team_members add column if not exists grade text`,
  `alter table team_members add column if not exists dept text`,
  `alter table team_members add column if not exists division text`,

  // Every employee in the HR sheet (no birth dates: those are read from the sheet only at first login).
  `create table if not exists employees (
    nik text primary key,
    name text not null,
    title text,
    grade text,
    dept text,
    division text,
    email text,
    active boolean not null default true,
    synced_at timestamptz not null default now()
  )`,
  `create index if not exists employees_grade_idx on employees(grade)`,

  `create table if not exists cases (
    id serial primary key,
    code text unique not null,
    category text not null,
    title text not null,
    unit_id int references units(id) on delete set null,
    incident_date date,
    reported_date date,
    reporter text,
    counterparty text,
    forum text,
    risk text not null default 'Sedang' check (risk in ('Rendah','Sedang','Tinggi')),
    exposure numeric,
    chronology text,
    root_cause_cat text,
    root_cause text,
    pic_id int references team_members(id) on delete set null,
    external_counsel text,
    status text not null default 'baru' check (status in ('baru','investigasi','proses','selesai')),
    decision text,
    outcome text,
    settlement numeric,
    closed_at date,
    lesson text,
    preventive text,
    kb_code text,
    is_demo boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    updated_by text
  )`,
  `create index if not exists cases_status_idx on cases(status, category)`,

  // Handling flow: who handled the case, at which stage, what they did.
  `create table if not exists case_steps (
    id serial primary key,
    case_id int not null references cases(id) on delete cascade,
    step_date date not null,
    stage text not null,
    handler text not null,
    action text not null,
    by_name text,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists case_steps_case_idx on case_steps(case_id, step_date)`,

  // Case files (Berita Acara, bukti, putusan, kesepakatan) — these feed Repository › Berkas Case.
  `create table if not exists case_docs (
    id serial primary key,
    case_id int not null references cases(id) on delete cascade,
    kind text not null,
    label text not null,
    url text,
    doc_date date,
    by_name text,
    created_at timestamptz not null default now()
  )`,

  // SIGAP output (the SIGAP system is embedded; its results land here and feed the Knowledge Base).
  `create table if not exists sigap_results (
    id serial primary key,
    code text unique not null,
    ref text,
    result_date date not null,
    unit_id int references units(id) on delete set null,
    category text,
    violation text not null,
    decision text,
    root_cause text,
    lesson text,
    kb_code text,
    is_demo boolean not null default false,
    created_at timestamptz not null default now(),
    updated_by text
  )`,

  // Knowledge Base entries now come from Cases, SIGAP or the Google Doc.
  `alter table kb_cases drop constraint if exists kb_cases_source_check`,
  `alter table kb_cases add column if not exists root_cause text`,
  `alter table kb_cases add column if not exists outcome text`,
  `alter table kb_cases add column if not exists lesson text`,
  `alter table kb_cases add column if not exists case_id int references cases(id) on delete cascade`,
  `alter table kb_cases add column if not exists sigap_id int references sigap_results(id) on delete cascade`,

  // Repository holds Legal Opinions and other memos; PKS/PSM/License live in Data Record now.
  `alter table library drop constraint if exists library_kind_check`,
];

// v12: Reklame renewal threshold 60 days (2 months before expiry); attachments older than 3 years are removed.
export const LDMS_MIGRATION_V12 = [
  `update permit_types set lead_days = 60 where code = 'RKL'`,
  `create index if not exists files_created_idx on files(created_at)`,
  `delete from files where created_at < now() - interval '3 years'`,
];
