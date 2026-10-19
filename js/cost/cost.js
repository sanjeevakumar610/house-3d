// The Cost tab: quantities from the model, an editable LKR price table, per-floor totals,
// a side-by-side price of every facade style, and Excel / PDF export. Rates, assumptions and
// walling choice are kept in this browser.
import { computeQuantities } from './quantities.js';
import { PRICE_LIST, DEFAULT_RATES, ASSUMPTIONS, DEFAULT_ASSUMPTIONS, NOTES, openingBaseRate } from './prices.js';
import { FLOOR_FINISHES } from '../materials.js';
import { STYLES, FRAME_LABEL } from '../styles.js';

const KEY = 'house3d.cost.v1';
const lkr = (n) => 'LKR ' + Math.round(n).toLocaleString('en-US');
const num = (n, d = 0) => (Math.abs(n) < 1e-9 ? '–' : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const DEC = { bag: 1, cube: 2, kg: 0, nos: 0, 'sq ft': 0, litre: 1, rft: 0, 'cu ft': 1, set: 0 };
const WHOLE = new Set(['bag', 'nos', 'litre', 'set']); // bought in whole units
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const scripts = {};
function loadScript(src) {
  return (scripts[src] ||= new Promise((ok, fail) => {
    const s = Object.assign(document.createElement('script'), { src, onload: ok, onerror: () => fail(new Error('Could not load ' + src)) });
    document.head.append(s);
  }));
}

export class CostTab {
  // compare(styleId) → { plan, house, dispose } builds another style for the comparison table
  constructor({ plan, house, designer, compare, onPickStyle }) {
    Object.assign(this, { plan, house, designer, compare, onPickStyle });
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch { /* storage blocked */ }
    this.rates = { ...DEFAULT_RATES, ...(saved?.rates || {}) };
    this.A = { ...DEFAULT_ASSUMPTIONS, ...(saved?.assumptions || {}) };
    this.walling = saved?.walling || 'bricks';
    this.el = document.getElementById('cost');
    this.view = 'summary';
    this.open = false;
    this.dirty = true;
    this.comparison = null;
    this.el.addEventListener('input', (e) => this.onInput(e));
    this.el.addEventListener('click', (e) => this.onClick(e));
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ rates: this.rates, assumptions: this.A, walling: this.walling })); } catch { /* storage blocked */ }
  }

  // the house was rebuilt for another floor count or style
  setHouse(plan, house) {
    const floorsChanged = this.plan.variant?.floors !== plan.variant?.floors;
    this.plan = plan; this.house = house;
    if (floorsChanged) this.comparison = null;
    this.designChanged();
  }

  show() { this.open = true; this.el.hidden = false; document.body.classList.add('costing'); this.refresh(); }
  hide() { this.open = false; this.el.hidden = true; document.body.classList.remove('costing'); }
  // the design changed (paint, floors, furniture, style): recompute if visible
  designChanged() { this.dirty = true; if (this.open) { clearTimeout(this.t); this.t = setTimeout(() => this.refresh(), 250); } }

  get sections() { return this.data.sections; }
  get SEC() { return this.data.sections.map(([k]) => k); }
  secName(k) { return this.sections.find(([s]) => s === k)?.[1] || k; }

  calc(plan = this.plan, house = this.house) {
    return computeQuantities({ plan, house, designer: this.designer, A: this.A, walling: this.walling });
  }

  refresh() {
    this.data = this.calc();
    this.dirty = false;
    this.render();
  }

  // ------------------------------------------------------------ numbers
  rows(data = this.data, plan = this.plan) {
    const { Q } = data;
    const SEC = data.sections.map(([k]) => k);
    const out = [];
    for (const [key, [cat, name, unit]] of Object.entries(PRICE_LIST)) {
      const q = Q[key];
      if (!q) continue;
      const total = SEC.reduce((s, k) => s + q[k], 0);
      if (total < 1e-6) continue;
      const buy = WHOLE.has(unit) ? Math.ceil(total - 1e-9) : total;
      const amount = buy * (this.rates[key] || 0);
      out.push({ key, cat, name, unit, q, total, buy, rate: this.rates[key] || 0, factor: 1, amount, bySec: Object.fromEntries(SEC.map((k) => [k, total ? (amount * q[k]) / total : 0])) });
    }
    const st = plan.style;
    for (const o of data.openings) {
      const key = 'op:' + o.tag, rate = this.rates[key] ?? openingBaseRate(o.tag, plan.schedule);
      const factor = o.kind === 'door' ? 1 : st.factor || 1;
      const total = SEC.reduce((s, k) => s + o.qty[k], 0);
      const finish = factor !== 1 ? ` · ${FRAME_LABEL[st.frame] || st.frame} ×${factor}` : '';
      out.push({ key, cat: 'Doors & windows', name: `${o.tag}: ${o.desc}, ${o.size}${finish}`, unit: 'nos', q: o.qty, total, buy: total, rate, factor, amount: total * rate * factor, bySec: Object.fromEntries(SEC.map((k) => [k, o.qty[k] * rate * factor])) });
    }
    return out;
  }

  totals(rows, SEC = this.SEC) {
    const bySec = Object.fromEntries(SEC.map((k) => [k, rows.reduce((s, r) => s + (r.bySec[k] || 0), 0)]));
    return { bySec, grand: SEC.reduce((s, k) => s + bySec[k], 0) };
  }

  variantLabel(plan = this.plan) {
    return `${plan.variant.floors === 3 ? 'G+2' : 'G+1'} · ${plan.style.long || plan.style.name}`;
  }

  // ------------------------------------------------------------ rendering
  render() {
    const rows = this.rows(), T = this.totals(rows);
    this.lastRows = rows;
    const tabs = [['summary', 'Materials'], ['openings', 'Doors & windows'], ['paint', 'Paint'], ['floors', 'Floors'], ['details', 'Structure'], ['compare', 'Compare styles'], ['assume', 'Assumptions']];
    this.el.innerHTML = `
      <div class="cost-inner">
        <header class="cost-head">
          <div>
            <h2>Material cost estimate <span class="variant">${esc(this.variantLabel())}</span></h2>
            <p class="lede">Quantities are taken from the 3D model and update when you change the floors, style, paint, floor finishes or counters. Material only, no labour. <b>Rates are placeholders:</b> type in current Colombo prices.</p>
          </div>
          <button class="cost-close" data-act="close" aria-label="Close cost estimate">×</button>
        </header>
        <div class="cost-totals">
          <div class="grand"><span>Grand total</span><b data-total="grand">${lkr(T.grand)}</b></div>
          ${this.sections.map(([k, n]) => `<div><span>${n}</span><b data-total="${k}">${lkr(T.bySec[k])}</b></div>`).join('')}
        </div>
        <div class="cost-tools">
          <div class="seg" role="group" aria-label="Walling">
            <span>Walls in</span>
            <button data-wall="bricks" class="${this.walling === 'bricks' ? 'on' : ''}">Bricks</button>
            <button data-wall="blocks" class="${this.walling === 'blocks' ? 'on' : ''}">Cement blocks</button>
          </div>
          <div class="spacer"></div>
          <button data-act="xlsx">Download Excel</button>
          <button data-act="pdf">Download PDF</button>
        </div>
        <nav class="cost-tabs" role="tablist">${tabs.map(([k, n]) => `<button role="tab" data-view="${k}" class="${this.view === k ? 'on' : ''}">${n}</button>`).join('')}</nav>
        <div class="cost-body">${this.renderView(rows, T)}</div>
      </div>`;
  }

  renderView(rows, T) {
    const SEC = this.SEC;
    const secHead = this.sections.map(([, n]) => `<th class="n">${n}</th>`).join('');
    const rateInput = (r) => `<input type="number" min="0" step="any" inputmode="decimal" data-rate="${r.key}" value="${r.rate}" aria-label="Rate for ${esc(r.name)}">`;
    if (this.view === 'summary' || this.view === 'openings') {
      const list = rows.filter((r) => (this.view === 'openings') === (r.cat === 'Doors & windows'));
      let html = `<div class="tbl-wrap"><table class="cost-tbl"><thead><tr><th>Item</th><th>Unit</th>${secHead}<th class="n">Total qty</th><th class="n">Rate (LKR)</th><th class="n">Amount (LKR)</th></tr></thead><tbody>`;
      let cat = null;
      for (const r of list) {
        if (r.cat !== cat) { cat = r.cat; html += `<tr class="cat"><td colspan="${5 + SEC.length}">${cat}</td></tr>`; }
        const d = DEC[r.unit] ?? 1;
        html += `<tr><td>${esc(r.name)}</td><td>${r.unit}</td>${SEC.map((k) => `<td class="n">${num(r.q[k], d)}</td>`).join('')}<td class="n b">${num(r.buy, WHOLE.has(r.unit) ? 0 : d)}</td><td class="n">${rateInput(r)}</td><td class="n b" data-amount="${r.key}">${num(r.amount)}</td></tr>`;
      }
      const sub = this.totals(list);
      html += `</tbody><tfoot><tr><td colspan="2">${this.view === 'openings' ? 'Doors & windows total' : 'Total (all items incl. doors & windows)'}</td>${SEC.map((k) => `<td class="n">${num((this.view === 'openings' ? sub : T).bySec[k])}</td>`).join('')}<td></td><td></td><td class="n b">${num((this.view === 'openings' ? sub : T).grand)}</td></tr></tfoot></table></div>`;
      if (this.view === 'summary') html += `<p class="fine">Quantities include wastage. Per-floor columns show quantities; per-floor money totals are in the cards above. Amounts use whole units for bags, nos, litres and sets.</p>`;
      else html += `<p class="fine">Rates are for plain aluminium. The style's frame finish multiplies window and sliding door prices (shown on each row).</p>`;
      return html;
    }
    if (this.view === 'paint') {
      const rowsP = this.data.paintRows.filter((p) => p.area > 0.5);
      return `<div class="tbl-wrap"><table class="cost-tbl"><thead><tr><th>Colour</th><th>Where</th><th>Floor</th><th class="n">Area (sq ft)</th><th class="n">Coats</th><th class="n">Litres</th></tr></thead><tbody>
        ${rowsP.map((p) => `<tr><td><span class="sw" style="background:${p.hex}"></span>${esc(p.name)}</td><td>${p.what}</td><td>${this.secName(p.sec)}</td><td class="n">${num(p.area)}</td><td class="n">${p.coats}</td><td class="n b">${num(p.litres, 1)}</td></tr>`).join('')}
        </tbody></table></div><p class="fine">Primer/sealer is listed under Materials. Dark colours get ${this.A.darkCoats} coats. Tiled bathroom walls, the kitchen backsplash and clad walls are left out of the paint area.</p>`;
    }
    if (this.view === 'floors') {
      return `<div class="tbl-wrap"><table class="cost-tbl"><thead><tr><th>Room</th><th>Floor</th><th>Finish</th><th class="n">Floor (sq ft)</th><th class="n">Skirting (sq ft)</th><th class="n">Total</th></tr></thead><tbody>
        ${this.data.finishRows.map((f) => `<tr><td>${esc(f.room)}</td><td>${this.secName(f.sec)}</td><td>${FLOOR_FINISHES[f.finish]?.label || f.finish}</td><td class="n">${num(f.area)}</td><td class="n">${num(f.skirting)}</td><td class="n b">${num(f.area + f.skirting)}</td></tr>`).join('')}
        </tbody></table></div><p class="fine">Change a room's finish with the Floors tool; this table and the Materials list update automatically. Cutting waste (${this.A.wasteTiles}%) is added in the Materials list.</p>`;
    }
    if (this.view === 'details') {
      return `<div class="tbl-wrap"><table class="cost-tbl"><thead><tr><th>Section</th><th>Element</th><th class="n">Quantity</th><th>Unit</th></tr></thead><tbody>
        ${this.data.elements.map((e) => `<tr><td>${this.secName(e.sec)}</td><td>${esc(e.name)}</td><td class="n">${num(e.qty, 1)}</td><td>${e.unit}</td></tr>`).join('')}
        </tbody></table></div>`;
    }
    if (this.view === 'compare') return this.renderCompare();
    // assumptions
    const groups = {};
    for (const [k, [label, unit, , g]] of Object.entries(ASSUMPTIONS)) (groups[g] ||= []).push([k, label, unit]);
    return `<div class="assume">${Object.entries(groups).map(([g, list]) => `<fieldset><legend>${g}</legend>${list.map(([k, label, unit]) => `<label><span>${label}</span><input type="number" step="any" min="0" data-assume="${k}" value="${this.A[k]}"><em>${unit}</em></label>`).join('')}</fieldset>`).join('')}</div>
      <div class="cost-tools"><button data-act="reset-assume">Reset assumptions</button><button data-act="reset-rates">Reset all rates to placeholders</button></div>
      <h3>How the estimate is made</h3><ul class="notes">${NOTES.map((n) => `<li>${n}</li>`).join('')}</ul>`;
  }

  renderCompare() {
    const floors = this.plan.variant.floors === 3 ? 'G+2' : 'G+1';
    if (!this.comparison) {
      return `<div class="compare-empty"><p>Price all ${STYLES.length} options (${floors}) with your current rates, floor finishes and furniture. Paint uses each style's default colours.</p>
        <button class="primary" data-act="compare">Work out all ${STYLES.length} styles</button></div>`;
    }
    if (this.comparison.busy) return `<div class="compare-empty"><p>Working out ${this.comparison.done} of ${STYLES.length}…</p></div>`;
    const base = this.comparison.rows.find((r) => r.id === 'original')?.grand || 0;
    const cur = this.plan.style.id;
    return `<div class="tbl-wrap"><table class="cost-tbl compare"><thead><tr><th>#</th><th>Style</th><th class="n">Structure & finishes</th><th class="n">Facade & style</th><th class="n">Grand total</th><th class="n">vs Original</th><th></th></tr></thead><tbody>
      ${this.comparison.rows.map((r) => `<tr class="${r.id === cur ? 'on' : ''}"><td>${r.n}</td><td><span class="sw-strip">${r.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</span>${esc(r.name)}</td><td class="n">${num(r.grand - r.ext)}</td><td class="n">${num(r.ext)}</td><td class="n b">${num(r.grand)}</td><td class="n ${r.grand - base > 0 ? 'up' : 'down'}">${r.id === 'original' ? '–' : (r.grand - base > 0 ? '+' : '−') + num(Math.abs(r.grand - base))}</td><td>${r.id === cur ? '<em>Showing</em>' : `<button data-pick="${r.id}">Show</button>`}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="fine">${floors}, worked out ${this.comparison.at}. Change rates or assumptions, then <button class="link" data-act="compare">work it out again</button>. Material only; the style's own items (cladding, fins, screens, gate, garden) are in "Facade & style".</p>`;
  }

  async runCompare() {
    if (!this.compare) return;
    this.comparison = { busy: true, done: 0 };
    this.render();
    const rows = [];
    for (const s of STYLES) {
      await new Promise((r) => setTimeout(r, 0));
      const v = this.compare(s.id);
      const data = this.calc(v.plan, v.house);
      const T = this.totals(this.rows(data, v.plan), data.sections.map(([k]) => k));
      rows.push({ id: s.id, n: s.n, name: s.long || s.name, swatch: s.swatch, grand: T.grand, ext: T.bySec.ext || 0 });
      v.dispose();
      this.comparison.done = rows.length;
      if (this.view === 'compare') this.el.querySelector('.cost-body').innerHTML = this.renderView();
    }
    this.comparison = { rows, at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    if (this.open && this.view === 'compare') this.el.querySelector('.cost-body').innerHTML = this.renderView();
  }

  // ------------------------------------------------------------ events
  onInput(e) {
    const t = e.target;
    const SEC = this.SEC;
    if (t.dataset.rate) {
      this.rates[t.dataset.rate] = Math.max(0, parseFloat(t.value) || 0);
      this.save();
      // update amounts in place so the field keeps focus
      const rows = this.rows(), T = this.totals(rows);
      for (const r of rows) { const c = this.el.querySelector(`[data-amount="${CSS.escape(r.key)}"]`); if (c) c.textContent = num(r.amount); }
      this.el.querySelector('[data-total="grand"]').textContent = lkr(T.grand);
      for (const k of SEC) this.el.querySelector(`[data-total="${k}"]`).textContent = lkr(T.bySec[k]);
      const list = rows.filter((r) => (this.view === 'openings') === (r.cat === 'Doors & windows'));
      const foot = this.el.querySelector('tfoot tr');
      if (foot) {
        const sub = this.view === 'openings' ? this.totals(list) : T;
        const cells = foot.querySelectorAll('td.n');
        SEC.forEach((k, i) => { cells[i].textContent = num(sub.bySec[k]); });
        cells[cells.length - 1].textContent = num(sub.grand);
      }
    }
    if (t.dataset.assume) {
      const v = parseFloat(t.value);
      if (!isFinite(v)) return;
      this.A[t.dataset.assume] = v;
      this.save();
      clearTimeout(this.ta);
      this.ta = setTimeout(() => { this.data = this.calc(); this.updateTotalsOnly(); }, 300);
    }
  }

  updateTotalsOnly() {
    const T = this.totals(this.rows());
    this.el.querySelector('[data-total="grand"]').textContent = lkr(T.grand);
    for (const k of this.SEC) this.el.querySelector(`[data-total="${k}"]`).textContent = lkr(T.bySec[k]);
  }

  async onClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.view) { this.view = b.dataset.view; this.render(); }
    if (b.dataset.wall) { this.walling = b.dataset.wall; this.save(); this.refresh(); }
    if (b.dataset.pick) this.onPickStyle?.(b.dataset.pick);
    const act = b.dataset.act;
    if (act === 'close') this.hide();
    if (act === 'compare') this.runCompare();
    if (act === 'reset-assume') { this.A = { ...DEFAULT_ASSUMPTIONS }; this.save(); this.refresh(); }
    if (act === 'reset-rates' && confirm('Reset every rate to the placeholder values?')) { this.rates = { ...DEFAULT_RATES }; this.save(); this.refresh(); }
    if (act === 'xlsx' || act === 'pdf') {
      const label = b.textContent;
      b.disabled = true; b.textContent = 'Preparing…';
      try { if (act === 'xlsx') await this.exportXlsx(); else await this.exportPdf(); }
      catch (err) { alert('Export failed: ' + err.message + '. Check your internet connection and try again.'); }
      finally { b.disabled = false; b.textContent = label; }
    }
  }

  // ------------------------------------------------------------ export
  fileName(ext) { return `house-material-estimate-${this.plan.variant.floors === 3 ? 'G+2' : 'G+1'}-${this.plan.style.id}-${new Date().toISOString().slice(0, 10)}.${ext}`; }

  async exportXlsx() {
    await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
    const XLSX = window.XLSX;
    if (this.dirty) this.refresh();
    const rows = this.rows(), SEC = this.SEC, SECTIONS = this.sections;
    const wb = XLSX.utils.book_new();

    // Materials sheet with live formulas so rates can be edited in Excel too
    const head = ['Category', 'Item', 'Unit', ...SECTIONS.map(([, n]) => n), 'Total qty', 'Rate (LKR)', 'Amount (LKR)', ...SECTIONS.map(([, n]) => `${n} (LKR)`)];
    const aoa = [['Material cost estimate (LKR): material only, no labour. Rates are placeholders unless edited.'], [`${this.variantLabel()} · prepared ${new Date().toLocaleDateString()} · walls in ${this.walling === 'blocks' ? 'cement blocks' : 'bricks'}`], [], head];
    const first = aoa.length + 1;
    // window and sliding door rates include the style's frame finish factor
    rows.forEach((r) => aoa.push([r.cat, r.name, r.unit, ...SEC.map((k) => +r.q[k].toFixed(3)), null, +(r.rate * r.factor).toFixed(2), null, ...SEC.map(() => null)]));
    const last = aoa.length;
    aoa.push([]);
    aoa.push(['', 'TOTAL']);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const col = (i) => XLSX.utils.encode_col(i);
    const cQty = 3, cTot = 3 + SEC.length, cRate = cTot + 1, cAmt = cTot + 2, cSec = cTot + 3;
    for (let r = first; r <= last; r++) {
      const unit = rows[r - first].unit;
      const sum = `SUM(${col(cQty)}${r}:${col(cQty + SEC.length - 1)}${r})`;
      ws[`${col(cTot)}${r}`] = { t: 'n', f: WHOLE.has(unit) ? `ROUNDUP(${sum},0)` : `ROUND(${sum},2)` };
      ws[`${col(cAmt)}${r}`] = { t: 'n', f: `${col(cTot)}${r}*${col(cRate)}${r}` };
      SEC.forEach((k, i) => { ws[`${col(cSec + i)}${r}`] = { t: 'n', f: `IF(${col(cTot)}${r}=0,0,${col(cAmt)}${r}*${col(cQty + i)}${r}/SUM(${col(cQty)}${r}:${col(cQty + SEC.length - 1)}${r}))` }; });
    }
    const tr = last + 2;
    ws[`${col(cAmt)}${tr}`] = { t: 'n', f: `SUM(${col(cAmt)}${first}:${col(cAmt)}${last})` };
    SEC.forEach((k, i) => { ws[`${col(cSec + i)}${tr}`] = { t: 'n', f: `SUM(${col(cSec + i)}${first}:${col(cSec + i)}${last})` }; });
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: tr - 1, c: cSec + SEC.length - 1 } });
    ws['!cols'] = [{ wch: 22 }, { wch: 52 }, { wch: 7 }, ...SEC.map(() => ({ wch: 12 })), { wch: 11 }, { wch: 12 }, { wch: 14 }, ...SEC.map(() => ({ wch: 16 }))];
    XLSX.utils.book_append_sheet(wb, ws, 'Materials');

    const sheet = (name, header, data, widths) => {
      const s = XLSX.utils.aoa_to_sheet([header, ...data]);
      s['!cols'] = widths.map((w) => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, s, name);
    };
    sheet('Paint by colour', ['Colour', 'Hex', 'Where', 'Floor', 'Area (sq ft)', 'Coats', 'Litres'],
      this.data.paintRows.filter((p) => p.area > 0.5).map((p) => [p.name, p.hex, p.what, this.secName(p.sec), +p.area.toFixed(1), p.coats, +p.litres.toFixed(2)]), [24, 9, 26, 16, 12, 7, 9]);
    sheet('Floor finishes', ['Room', 'Floor', 'Finish', 'Floor area (sq ft)', 'Skirting (sq ft)', 'Total (sq ft)'],
      this.data.finishRows.map((f) => [f.room, this.secName(f.sec), FLOOR_FINISHES[f.finish]?.label || f.finish, +f.area.toFixed(1), +f.skirting.toFixed(1), +(f.area + f.skirting).toFixed(1)]), [26, 16, 26, 16, 14, 12]);
    sheet('Structure', ['Section', 'Element', 'Quantity', 'Unit'], this.data.elements.map((e) => [this.secName(e.sec), e.name, +e.qty.toFixed(2), e.unit]), [16, 70, 12, 8]);
    if (this.comparison?.rows) sheet('Compare styles', ['#', 'Style', 'Structure & finishes (LKR)', 'Facade & style (LKR)', 'Grand total (LKR)'], this.comparison.rows.map((r) => [r.n, r.name, Math.round(r.grand - r.ext), Math.round(r.ext), Math.round(r.grand)]), [4, 28, 24, 20, 18]);
    sheet('Assumptions', ['Assumption', 'Value', 'Unit'], [
      ...Object.entries(ASSUMPTIONS).map(([k, [label, unit]]) => [label, this.A[k], unit]),
      ['Walling', this.walling === 'blocks' ? 'Cement blocks' : 'Bricks', ''], ['Variant', this.variantLabel(), ''], [], ...NOTES.map((n) => [n])], [60, 24, 22]);

    XLSX.writeFile(wb, this.fileName('xlsx'));
  }

  async exportPdf() {
    await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
    await loadScript('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js');
    if (this.dirty) this.refresh();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const rows = this.rows(), T = this.totals(rows), SEC = this.SEC, SECTIONS = this.sections;
    const money = (n) => Math.round(n).toLocaleString('en-US');
    doc.setFontSize(16); doc.text('Material cost estimate', 14, 16);
    doc.setFontSize(9); doc.setTextColor(90);
    doc.text(`${this.plan.variant.floors === 3 ? 'Three' : 'Two'}-storey house, ${this.plan.style.long || this.plan.style.name} · prepared ${new Date().toLocaleDateString()} · walls in ${this.walling === 'blocks' ? 'cement blocks' : 'bricks'} · material only, no labour · amounts in LKR`, 14, 22);
    doc.setTextColor(0);
    doc.autoTable({
      startY: 27, theme: 'grid', styles: { fontSize: 8.5 }, headStyles: { fillColor: [181, 86, 44] },
      head: [['', ...SECTIONS.map(([, n]) => n), 'Grand total']],
      body: [['Amount (LKR)', ...SEC.map((k) => money(T.bySec[k])), money(T.grand)]],
      columnStyles: { 0: { fontStyle: 'bold' } },
    });
    const nCols = 5 + SEC.length;
    const body = [];
    let cat = null;
    for (const r of rows) {
      if (r.cat !== cat) { cat = r.cat; body.push([{ content: cat, colSpan: nCols, styles: { fillColor: [238, 241, 244], fontStyle: 'bold' } }]); }
      const d = DEC[r.unit] ?? 1;
      body.push([r.name, r.unit, ...SEC.map((k) => (r.q[k] ? r.q[k].toFixed(d) : '')), WHOLE.has(r.unit) ? String(r.buy) : r.buy.toFixed(d), money(r.rate * r.factor), money(r.amount)]);
    }
    body.push([{ content: 'Total', colSpan: nCols - 1, styles: { fontStyle: 'bold', halign: 'right' } }, { content: money(T.grand), styles: { fontStyle: 'bold' } }]);
    const right = Object.fromEntries(Array.from({ length: nCols - 2 }, (_, i) => [i + 2, { halign: 'right' }]));
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 6, theme: 'striped', styles: { fontSize: 7, cellPadding: 1.3 }, headStyles: { fillColor: [51, 65, 76] },
      head: [['Item', 'Unit', ...SECTIONS.map(([, n]) => n), 'Total qty', 'Rate', 'Amount']],
      body, columnStyles: { 0: { cellWidth: 74 }, ...right },
    });
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 6, theme: 'striped', styles: { fontSize: 7.5, cellPadding: 1.4 }, headStyles: { fillColor: [51, 65, 76] },
      head: [['Paint colour', 'Where', 'Floor', 'Area (sq ft)', 'Coats', 'Litres']],
      body: this.data.paintRows.filter((p) => p.area > 0.5).map((p) => [p.name, p.what, this.secName(p.sec), p.area.toFixed(0), p.coats, p.litres.toFixed(1)]),
    });
    if (this.comparison?.rows) {
      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 6, theme: 'striped', styles: { fontSize: 7.5, cellPadding: 1.4 }, headStyles: { fillColor: [181, 86, 44] },
        head: [['#', 'Style', 'Structure & finishes', 'Facade & style', 'Grand total']],
        body: this.comparison.rows.map((r) => [r.n, r.name, money(r.grand - r.ext), money(r.ext), money(r.grand)]),
      });
    }
    let y = doc.lastAutoTable.finalY + 8;
    if (y > 170) { doc.addPage(); y = 16; }
    doc.setFontSize(10); doc.text('Notes and assumptions', 14, y);
    doc.setFontSize(7.5);
    const lines = doc.splitTextToSize(NOTES.map((n) => '• ' + n).join('\n'), 268);
    doc.text(lines, 14, y + 5);
    doc.save(this.fileName('pdf'));
  }
}
