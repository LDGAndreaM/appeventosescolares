import { downloadBlob } from './certificate';

export type Cell = string | number | null;

export interface Dataset {
  title: string;
  head: string[];
  rows: Cell[][];
}

const csvEscape = (v: Cell) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(d: Dataset) {
  return '﻿' + [d.head, ...d.rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

export async function downloadDataset(d: Dataset, format: 'xlsx' | 'csv', fileName: string) {
  if (format === 'csv') {
    downloadBlob(new Blob([toCSV(d)], { type: 'text/csv;charset=utf-8' }), `${fileName}.csv`);
    return;
  }
  const data = [
    d.head.map((h) => ({ value: h, fontWeight: 'bold' as const })),
    ...d.rows.map((r) => r.map((c) => (c == null || c === '' ? null : { value: c }))),
  ];
  const columns = d.head.map((h, i) => ({
    width: Math.min(48, Math.max(h.length, ...d.rows.slice(0, 200).map((r) => String(r[i] ?? '').length)) + 2),
  }));
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const blob = await writeXlsxFile(data, { columns, sheet: d.title.slice(0, 31), stickyRowsCount: 1 }).toBlob();
  downloadBlob(blob, `${fileName}.xlsx`);
}
