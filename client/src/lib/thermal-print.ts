// Shared ESC/POS and printing helpers used across cash-register and cash-withdrawal components

const _ESC = '\x1B';
const _GS  = '\x1D';

export const EP = {
  INIT:        _ESC + '@',
  CENTER:      _ESC + 'a\x01',
  LEFT:        _ESC + 'a\x00',
  BOLD_ON:     _ESC + 'E\x01',
  BOLD_OFF:    _ESC + 'E\x00',
  SIZE_DOUBLE: _GS  + '!\x11',
  SIZE_NORMAL: _GS  + '!\x00',
  CUT:         _GS  + 'V\x00',
  LINE:        '-'.repeat(32),
};

export function fmtNum(v: number | string | null | undefined): string {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
  return isNaN(n) ? '0.00' : n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function pad32(left: string, right: string): string {
  return left + ' '.repeat(Math.max(1, 32 - left.length - right.length)) + right;
}

// ─── Withdrawal Thermal Ticket (58 mm) ────────────────────────────────────────

export function buildWithdrawalThermalTicket(w: {
  id: number;
  concept: string;
  amount: string | number;
  currency: string;
  notes?: string | null;
  createdAt: string | Date;
  cashierName?: string;
  authorizerName?: string;
  storeName?: string;
}): string {
  const { INIT, CENTER, LEFT, BOLD_ON, BOLD_OFF, SIZE_DOUBLE, SIZE_NORMAL, CUT, LINE } = EP;
  const date = new Date(w.createdAt).toLocaleString('es-DO', {
    timeZone: 'America/Santo_Domingo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  let t = INIT;
  t += CENTER + SIZE_DOUBLE + BOLD_ON + 'RETIRO DE CAJA\n' + BOLD_OFF + SIZE_NORMAL;
  if (w.storeName) t += w.storeName + '\n';
  t += LINE + '\n';
  t += LEFT;
  t += BOLD_ON + 'No.: '        + BOLD_OFF + String(w.id).padStart(6, '0') + '\n';
  t += BOLD_ON + 'Fecha: '      + BOLD_OFF + date + '\n';
  t += BOLD_ON + 'Cajero: '     + BOLD_OFF + (w.cashierName ?? '—') + '\n';
  t += BOLD_ON + 'Autorizado: ' + BOLD_OFF + (w.authorizerName ?? '—') + '\n';
  t += LINE + '\n';
  t += CENTER + BOLD_ON + 'CONCEPTO\n' + BOLD_OFF;
  t += LEFT + w.concept + '\n';
  if (w.notes) t += '\n' + w.notes + '\n';
  t += LINE + '\n';
  t += SIZE_DOUBLE + BOLD_ON + pad32('MONTO:', w.currency + ' ' + fmtNum(w.amount)) + '\n' + BOLD_OFF + SIZE_NORMAL;
  t += LINE + '\n';
  t += CENTER + 'Firma autorizado:\n\n\n';
  t += '_________________________\n';
  t += '\n\n\n' + CUT;
  return t;
}

// ─── Withdrawal Normal HTML (A4) ─────────────────────────────────────────────

export function buildWithdrawalNormalHtml(w: {
  id: number;
  concept: string;
  amount: string | number;
  currency: string;
  notes?: string | null;
  createdAt: string | Date;
  cashierName?: string;
  authorizerName?: string;
  storeName?: string;
}): string {
  const date = new Date(w.createdAt).toLocaleString('es-DO', {
    timeZone: 'America/Santo_Domingo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Retiro de Efectivo #${String(w.id).padStart(6, '0')}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:40px}
    @page{size:A4;margin:20mm}
    @media print{body{padding:0}}
    .header{text-align:center;margin-bottom:24px}
    .title{font-size:24px;font-weight:700;margin-bottom:4px}
    .subtitle{font-size:14px;color:#6b7280}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    td{padding:8px 0;vertical-align:top}
    td strong{font-weight:700}
    .amount-box{background:#f3f4f6;border:2px solid #374151;border-radius:8px;padding:16px;text-align:center;margin:24px 0}
    .amount-label{font-size:13px;color:#6b7280;margin-bottom:4px}
    .amount-value{font-size:28px;font-weight:700;color:#111}
    .divider{border:none;border-top:1px solid #e5e7eb;margin:16px 0}
    .sig-row{display:flex;gap:48px;margin-top:48px}
    .sig-line{flex:1;border-top:1px solid #374151;padding-top:8px;text-align:center;font-size:12px;color:#6b7280}
    .footer{text-align:center;color:#9ca3af;font-size:11px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px}
  </style></head><body>
  <div class="header">
    ${w.storeName ? `<div style="font-size:16px;font-weight:600;color:#374151;margin-bottom:6px">${w.storeName}</div>` : ''}
    <div class="title">COMPROBANTE DE RETIRO DE EFECTIVO</div>
    <div class="subtitle">No. ${String(w.id).padStart(6, '0')} &mdash; ${date}</div>
  </div>
  <hr class="divider">
  <table>
    <tr><td style="width:50%"><strong>Cajero:</strong> ${w.cashierName ?? '—'}</td>
        <td><strong>Autorizado por:</strong> ${w.authorizerName ?? '—'}</td></tr>
  </table>
  <hr class="divider">
  <p style="font-size:12px;color:#6b7280;margin-bottom:4px;font-weight:600;text-transform:uppercase">Concepto</p>
  <p style="font-size:14px;margin-bottom:8px">${w.concept}</p>
  ${w.notes ? `<p style="font-size:12px;color:#6b7280;margin-top:4px">${w.notes}</p>` : ''}
  <div class="amount-box">
    <div class="amount-label">Monto retirado</div>
    <div class="amount-value">${w.currency} ${fmtNum(w.amount)}</div>
  </div>
  <div class="sig-row">
    <div class="sig-line">Entregado por (cajero)<br>${w.cashierName ?? ''}</div>
    <div class="sig-line">Autorizado por<br>${w.authorizerName ?? ''}</div>
  </div>
  <div class="footer">Impreso el ${new Date().toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' })}</div>
  </body></html>`;
}
