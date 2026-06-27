/**
 * 构建 data/yanbot.db（schools + admissions 两张表）。
 *
 * 自包含：仅依赖 sql.js（已安装）与 xlsx（devDependency）。不依赖 better-sqlite3，
 * 不依赖 yanbot-claw 的 node_modules。数据源默认从同级目录 ../yanbot-claw/data 读取。
 *
 * 用法：
 *   npm i -D xlsx        # 一次性
 *   node scripts/build-yanbot-db.mjs
 *   # 或自定义数据源：  SRC_DATA_DIR=/path/to/yanbot-claw/data node scripts/build-yanbot-db.mjs
 *
 * 逻辑移植自 yanbot-claw/scripts/{import-schools.ts,import-hebei-2025.ts,schema.ts}。
 */
import initSqlJs from 'sql.js';
import * as XLSX from 'xlsx';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SRC_DATA_DIR = process.env.SRC_DATA_DIR || path.resolve(PROJECT_ROOT, '..', 'yanbot-claw', 'data');
const OUT_DB = path.join(PROJECT_ROOT, 'data', 'yanbot.db');
const SCHOOLS_JSON = path.join(SRC_DATA_DIR, 'yanbot-prod.schools.json');

const YEAR = 2025;
const PROVINCE = '河北';
const BATCH = '本科批';
const ENROLL_TYPE = '非定向';
const HEADER_ROWS = 6;

const FILES = [
  { file: '2025年河北省普通高校招生本科批-历史科目组合平行志愿投档情况统计(1).xlsx', subjectGroup: 'history' },
  { file: '2025年河北省普通高校招生本科批-物理科目组合平行志愿投档情况统计(2).xlsx', subjectGroup: 'physics' },
];

const CREATE_SCHOOLS_SQL = `
DROP TABLE IF EXISTS schools;
CREATE TABLE schools (
  school_id           TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  school_code         TEXT,
  type                TEXT,
  type_text           TEXT,
  type_school_text    TEXT,
  is_211              INTEGER NOT NULL DEFAULT 0,
  is_985              INTEGER NOT NULL DEFAULT 0,
  is_dual_class       INTEGER NOT NULL DEFAULT 0,
  province_text       TEXT,
  province_area_text  TEXT,
  belongs_to          TEXT,
  school_address      TEXT,
  rank                INTEGER,
  logo                TEXT,
  source_oid          TEXT,
  raw_detail          TEXT
);
CREATE UNIQUE INDEX uq_schools_name ON schools(name);
CREATE INDEX idx_schools_code ON schools(school_code);
`;

const CREATE_ADMISSIONS_SQL = `
DROP TABLE IF EXISTS admissions;
CREATE TABLE admissions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  year            INTEGER NOT NULL,
  province        TEXT    NOT NULL,
  batch           TEXT    NOT NULL,
  enroll_type     TEXT    NOT NULL,
  subject_group   TEXT    NOT NULL,
  school_code     TEXT    NOT NULL,
  school_name     TEXT    NOT NULL,
  school_city     TEXT,
  school_owner    TEXT,
  school_ref_id   TEXT REFERENCES schools(school_id),
  major_code      TEXT    NOT NULL,
  major_name      TEXT    NOT NULL,
  min_score           INTEGER,
  tie_chin_math_sum   INTEGER,
  tie_chin_math_max   INTEGER,
  tie_foreign         INTEGER,
  tie_primary_subj    INTEGER,
  tie_secondary_max   INTEGER,
  tie_secondary_2nd   INTEGER,
  tie_volunteer_no    INTEGER,
  remark          TEXT,
  source_file     TEXT    NOT NULL,
  UNIQUE(year, subject_group, school_code, major_code)
);
CREATE INDEX idx_admissions_group_score ON admissions(subject_group, min_score);
CREATE INDEX idx_admissions_school_code ON admissions(school_code);
CREATE INDEX idx_admissions_school_name ON admissions(school_name);
CREATE INDEX idx_admissions_school_ref ON admissions(school_ref_id);
`;

function safeJson(s) {
  if (typeof s !== 'string') return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
function toNullText(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}
function toStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}
function toInt(v) {
  const s = toStr(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// 形如「安徽财经大学(蚌埠市)[公办]」等，反复剥离末尾 [...] 与 (...)
function splitSchoolName(raw) {
  let s = raw.trim();
  let city = null;
  const ownerParts = [];
  while (true) {
    const tail = s.match(/(\[[^\[\]]+\]|[（(][^（()）]+[)）])\s*$/);
    if (!tail) break;
    const grp = tail[1];
    const inner = grp.slice(1, -1).trim();
    s = s.slice(0, tail.index).trim();
    if (grp.startsWith('[')) {
      if (inner) ownerParts.unshift(inner);
    } else {
      if (city === null && /[市省区盟州]$/.test(inner)) city = inner;
      else if (city === null) city = inner;
      else if (inner) ownerParts.unshift(inner);
    }
  }
  return { name: s, city, owner: ownerParts.length ? ownerParts.join('/') : null };
}

function parseSheet(filePath) {
  // ESM 构建的 xlsx 不暴露 readFile（依赖 fs），改为自行读取 buffer 再解析。
  const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  const rows = [];
  let skipped = 0;
  for (let i = HEADER_ROWS; i < matrix.length; i++) {
    const r = matrix[i];
    if (!r) continue;
    const schoolCode = toStr(r[0]);
    const schoolNameRaw = toStr(r[1]);
    const majorCode = toStr(r[2]);
    const majorName = toStr(r[3]);
    if (!/^\d+$/.test(schoolCode) || !schoolNameRaw || !majorCode || !majorName) {
      const empty = r.every((c) => toStr(c) === '');
      if (!empty) skipped++;
      continue;
    }
    const { name, city, owner } = splitSchoolName(schoolNameRaw);
    rows.push({
      schoolCode,
      schoolName: name,
      schoolCity: city,
      schoolOwner: owner,
      majorCode,
      majorName,
      minScore: toInt(r[4]),
      tieChinMathSum: toInt(r[5]),
      tieChinMathMax: toInt(r[6]),
      tieForeign: toInt(r[7]),
      tiePrimarySubj: toInt(r[8]),
      tieSecondaryMax: toInt(r[9]),
      tieSecondary2nd: toInt(r[10]),
      tieVolunteerNo: toInt(r[11]),
      remark: toStr(r[12]) || null,
    });
  }
  return { rows, skipped };
}

async function main() {
  if (!fs.existsSync(SRC_DATA_DIR)) throw new Error(`数据源目录不存在: ${SRC_DATA_DIR}`);
  if (!fs.existsSync(SCHOOLS_JSON)) throw new Error(`找不到 schools json: ${SCHOOLS_JSON}`);

  const SQL = await initSqlJs({
    locateFile: (f) => path.join(PROJECT_ROOT, 'node_modules', 'sql.js', 'dist', f),
  });
  const db = new SQL.Database();

  // ---- schools ----
  db.exec(CREATE_SCHOOLS_SQL);
  const schoolsData = JSON.parse(fs.readFileSync(SCHOOLS_JSON, 'utf8'));
  console.log(`schools source records: ${schoolsData.length}`);

  const insSchool = db.prepare(`
    INSERT INTO schools (
      school_id, name, school_code, type, type_text, type_school_text,
      is_211, is_985, is_dual_class, province_text, province_area_text,
      belongs_to, school_address, rank, logo, source_oid, raw_detail
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  let sWritten = 0, sSkip = 0, sDup = 0;
  const seenNames = new Set();
  const seenIds = new Set();
  db.exec('BEGIN');
  for (const r of schoolsData) {
    const name = toNullText(r.name);
    const schoolId = toNullText(r.school_id);
    if (!name || !schoolId) { sSkip++; continue; }
    if (seenIds.has(schoolId) || seenNames.has(name)) { sDup++; continue; }
    seenIds.add(schoolId);
    seenNames.add(name);
    const detail = safeJson(r.detail);
    insSchool.run([
      schoolId,
      name,
      toNullText(r.schoolCode),
      toNullText(r.type),
      toNullText(r.typeText),
      toNullText(r.typeSchoolText),
      r.is211 ? 1 : 0,
      r.is985 ? 1 : 0,
      r.isDual_class === '双一流' ? 1 : 0,
      toNullText(r.provinceText),
      toNullText(r.provinceAreaText),
      toNullText(detail?.belongsTo),
      toNullText(detail?.school_address),
      typeof r.rank === 'number' ? r.rank : null,
      toNullText(r.logo),
      toNullText(r._id?.$oid),
      typeof r.detail === 'string' ? r.detail : null,
    ]);
    sWritten++;
  }
  db.exec('COMMIT');
  insSchool.free();
  console.log(`schools done. written=${sWritten} skipped=${sSkip} dup=${sDup}`);

  // ---- admissions ----
  db.exec(CREATE_ADMISSIONS_SQL);
  const nameToSchoolId = new Map();
  const sel = db.prepare('SELECT school_id AS id, name FROM schools');
  while (sel.step()) {
    const row = sel.getAsObject();
    nameToSchoolId.set(row.name, row.id);
  }
  sel.free();

  const insAdm = db.prepare(`
    INSERT INTO admissions (
      year, province, batch, enroll_type, subject_group,
      school_code, school_name, school_city, school_owner, school_ref_id,
      major_code, major_name, min_score,
      tie_chin_math_sum, tie_chin_math_max, tie_foreign, tie_primary_subj,
      tie_secondary_max, tie_secondary_2nd, tie_volunteer_no, remark, source_file
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  let totalParsed = 0, totalLinked = 0, totalSkipped = 0;
  for (const f of FILES) {
    const filePath = path.join(SRC_DATA_DIR, f.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`[skip] file not found: ${filePath}`);
      continue;
    }
    const { rows, skipped } = parseSheet(filePath);
    let linked = 0;
    db.exec('BEGIN');
    for (const r of rows) {
      const schoolRefId = nameToSchoolId.get(r.schoolName) ?? null;
      if (schoolRefId) linked++;
      insAdm.run([
        YEAR, PROVINCE, BATCH, ENROLL_TYPE, f.subjectGroup,
        r.schoolCode, r.schoolName, r.schoolCity, r.schoolOwner, schoolRefId,
        r.majorCode, r.majorName, r.minScore,
        r.tieChinMathSum, r.tieChinMathMax, r.tieForeign, r.tiePrimarySubj,
        r.tieSecondaryMax, r.tieSecondary2nd, r.tieVolunteerNo, r.remark, f.file,
      ]);
    }
    db.exec('COMMIT');
    console.log(`[${f.subjectGroup}] parsed=${rows.length} linked=${linked}/${rows.length} skipped=${skipped}`);
    totalParsed += rows.length;
    totalLinked += linked;
    totalSkipped += skipped;
  }
  insAdm.free();

  const cntStmt = db.prepare('SELECT COUNT(*) AS n FROM admissions');
  cntStmt.step();
  const n = cntStmt.getAsObject().n;
  cntStmt.free();

  // 导出到文件
  fs.mkdirSync(path.dirname(OUT_DB), { recursive: true });
  const data = db.export();
  fs.writeFileSync(OUT_DB, Buffer.from(data));
  db.close();

  console.log(
    `\n✅ done. admissions parsed=${totalParsed} linked=${totalLinked} skipped=${totalSkipped} rows=${n}`
  );
  console.log(`   -> ${OUT_DB} (${(fs.statSync(OUT_DB).size / 1024).toFixed(0)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
