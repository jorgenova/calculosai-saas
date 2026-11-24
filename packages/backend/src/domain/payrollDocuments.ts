import { centsText } from './payrollTaxes';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] ?? char);
}

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function payrollMoney(amount: string) { return currency.format(Number(amount)); }
export function payrollDate(date: string) { return date.split('-').reverse().join('/'); }

export function payrollDocument(title: string, companyName: string, sections: { title?: string; rows: [string, string][] }[], draft = false) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title><style>
body{font:15px/1.5 system-ui,sans-serif;color:#182236;max-width:850px;margin:2.5rem auto;padding:0 1.5rem}
h1{font-size:1.75rem;margin-bottom:0}h2{font-size:1.15rem;margin-top:1.5rem}
table{border-collapse:collapse;width:100%;margin-bottom:1rem}th,td{padding:0.35rem;border-bottom:1px solid #cdd5e0}
th{text-align:left;width:60%;font-weight:500}td{text-align:right}.draft{font-weight:700;border:2px solid currentColor;padding:0.5rem}
@media print{body{margin:0;padding:0}tr{break-inside:avoid}}
</style></head><body>
<h1>${escapeHtml(title)}</h1><p>${escapeHtml(companyName)}</p>
${draft ? '<p class="draft">RASCUNHO — PARA CONFERÊNCIA</p>' : ''}
${sections.map(section => `${section.title ? '<h2>' + escapeHtml(section.title) + '</h2>' : ''}
<table><tbody>${section.rows.map(([label, value]) =>
    `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}</tbody></table>`).join('')}
</body></html>`;
}

export function formatPayrollTotal(values: string[]) {
  const total = values.reduce((sum, value) => sum + BigInt(value.replace('.', '')), 0n);
  return payrollMoney(centsText(total));
}
