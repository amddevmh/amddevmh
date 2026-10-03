/** Export CSV (séparateur « ; », BOM UTF-8 pour Excel en français). */
export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return `﻿${rows.map((r) => r.map(esc).join(';')).join('\r\n')}\r\n`
}

export function csvResponse(filename: string, rows: Array<Array<string | number | null | undefined>>): Response {
  return new Response(toCsv(rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
      'cache-control': 'no-store',
    },
  })
}
