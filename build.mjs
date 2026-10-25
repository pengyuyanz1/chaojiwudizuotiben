// 把 ../ai-trainer-quiz-main/data/questions.xlsx 转成浏览器可直接加载的 data/questions.js
// 用法：在 D:\Ming\train 下执行  node quiz-app/build.mjs
import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const xlsxPath = join(here, '..', 'ai-trainer-quiz-main', 'data', 'questions.xlsx');
const outPath = join(here, 'data', 'questions.js');

const wb = XLSX.read(readFileSync(xlsxPath), { type: 'buffer' });
const rows = XLSX.utils.sheet_to_json(wb.Sheets['题目库']);

const TYPE_MAP = { '判断': 'judge', '单选': 'single', '多选': 'multi' };
const clean = (v) => (v == null ? '' : String(v).trim());

const bank = rows.map((r) => {
  const type = TYPE_MAP[clean(r['题型'])];
  if (!type) throw new Error(`未知题型: ${r['ID']} ${r['题型']}`);
  let opts = [];
  if (type === 'judge') {
    opts = ['正确', '错误'];
  } else {
    for (const k of ['选项A', '选项B', '选项C', '选项D', '选项E']) {
      const v = clean(r[k]);
      if (v) opts.push(v);
    }
  }
  return {
    id: clean(r['ID']),
    lv: Number(r['等级']) || 0,
    type,
    ch: clean(r['章节']),
    sec: clean(r['小节']),
    stem: clean(r['题干']),
    opts,
    ans: clean(r['答案']).toUpperCase().replace(/[^√×A-E]/g, ''),
    src: clean(r['答案来源']),
    exp: clean(r['解析']),
  };
});

// 校验
const ids = new Set();
for (const q of bank) {
  if (!q.id || ids.has(q.id)) throw new Error(`ID 缺失或重复: ${q.id}`);
  ids.add(q.id);
  if (!q.stem || !q.ans) throw new Error(`题干/答案缺失: ${q.id}`);
  if (q.type === 'judge' && !'√×'.includes(q.ans)) throw new Error(`判断题答案异常: ${q.id} ${q.ans}`);
  if (q.type === 'single') {
    if (!/^[A-E]$/.test(q.ans)) throw new Error(`单选答案异常: ${q.id} ${q.ans}`);
    if (!q.opts[q.ans.charCodeAt(0) - 65]) throw new Error(`单选答案超出选项: ${q.id} ${q.ans}`);
  }
  if (q.type === 'multi') {
    if (!/^[A-E]{1,5}$/.test(q.ans)) throw new Error(`多选答案异常: ${q.id} ${q.ans}`);
    const idx = [...q.ans].map((c) => c.charCodeAt(0) - 65);
    if (idx.some((i) => !q.opts[i])) throw new Error(`多选答案超出选项: ${q.id} ${q.ans}`);
  }
}

const banner = `/* 本文件由 build.mjs 从 questions.xlsx 自动生成（${new Date().toLocaleString('zh-CN')}），请勿手工编辑 */
`;
const body = `window.QUESTION_BANK = ${JSON.stringify(bank)};\n`;
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, banner + body, 'utf8');
console.log(`OK: ${bank.length} 题 -> ${outPath}`);
