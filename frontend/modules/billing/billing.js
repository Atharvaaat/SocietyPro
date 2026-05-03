/**
 * Billing & Finance Module — Payments, Expenses, Invoices, Reports
 * frontend/modules/billing/billing.js
 */
import { supabase, callBackend } from '../../lib/supabase.js';
import { hasRole, currentUser } from '../auth/auth.js';
import { showToast, openModal, closeModal } from '../../lib/ui.js';

export async function render(container) {
  container.innerHTML = `
    <div class="animate-fade-in">
      <div class="tab-bar">
        <button class="tab-btn active" data-tab="payments">Payments</button>
        <button class="tab-btn" data-tab="expenses">Expenses</button>
        <button class="tab-btn" data-tab="invoices">Invoices & Bills</button>
        ${hasRole('secretary') ? `<button class="tab-btn" data-tab="reports">Reports</button>` : ''}
      </div>
      <div id="billing-content" style="margin-top:1rem;"></div>
    </div>`;

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      loadTab(btn.dataset.tab);
    });
  });
  loadTab('payments');
}

async function loadTab(tab) {
  const content = document.getElementById('billing-content');
  content.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';
  if (tab === 'payments') await renderPayments(content);
  else if (tab === 'expenses') await renderExpenses(content);
  else if (tab === 'invoices') await renderInvoices(content);
  else if (tab === 'reports') await renderReports(content);
}

/* ==========================================================================
   1. PAYMENTS TAB (Pending Dues & History)
   ========================================================================== */
async function renderPayments(container) {
  // Fetch pending dues for the user (or all if secretary)
  let pendingQuery = supabase.from('invoices')
    .select('*, units(unit_number), members(user_id, name)')
    .in('status', ['Pending', 'Overdue', 'Pending Verification'])
    .order('due_date', { ascending: true });

  if (!hasRole('secretary')) {
    pendingQuery = pendingQuery.eq('members.user_id', currentUser.id);
  }
  
  const { data: pendingInvoices } = await pendingQuery;
  const filteredPending = hasRole('secretary') ? pendingInvoices : pendingInvoices?.filter(i => i.members !== null) || [];

  // Fetch payment history
  let historyQuery = supabase.from('payments')
    .select('*, units(unit_number), members(user_id, name), invoices(invoice_number)')
    .order('created_at', { ascending: false }).limit(20);

  if (!hasRole('secretary')) {
    historyQuery = historyQuery.eq('members.user_id', currentUser.id);
  }
  
  const { data: paymentsHistory } = await historyQuery;
  const filteredHistory = hasRole('secretary') ? paymentsHistory : paymentsHistory?.filter(p => p.members !== null) || [];

  container.innerHTML = `
    <h3 style="margin-bottom: 1rem;">Pending Dues</h3>
    <div class="card" style="overflow:hidden; margin-bottom: 2rem;">
      <table class="data-table">
        <thead><tr><th>Invoice #</th><th>Unit</th><th>Description</th><th>Amount</th><th>Penalty</th><th>Total</th><th>Due Date</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${filteredPending?.map(inv => {
          const sc = { Overdue:'danger', Pending:'warning', 'Pending Verification':'info' }[inv.status] || '';
          const isOverdue = inv.status === 'Overdue' || new Date(inv.due_date) < new Date();
          return `<tr>
            <td><strong>${inv.invoice_number}</strong></td>
            <td>${inv.units?.unit_number || '—'}</td>
            <td>${inv.invoice_type}</td>
            <td>₹${parseFloat(inv.amount).toLocaleString('en-IN')}</td>
            <td><span style="color:var(--status-danger)">₹${parseFloat(inv.penalty||0).toLocaleString('en-IN')}</span></td>
            <td><strong>₹${parseFloat(inv.total_amount).toLocaleString('en-IN')}</strong></td>
            <td ${isOverdue ? 'style="color:var(--status-danger);font-weight:bold;"' : ''}>${new Date(inv.due_date).toLocaleDateString('en-IN')}</td>
            <td><span class="badge badge-${sc}">${inv.status}</span></td>
            <td>
              ${(inv.status === 'Pending' || inv.status === 'Overdue') ? `
                <button class="btn btn-sm btn-primary" onclick="window._markPaid('${inv.id}','${inv.invoice_number}',${inv.total_amount})">Pay Now</button>
              ` : ''}
              ${hasRole('secretary') && inv.status === 'Pending Verification' ? `
                <button class="btn btn-sm btn-outline" onclick="window._verifyPayment('${inv.id}')">Verify</button>
              ` : ''}
            </td>
          </tr>`;
        }).join('') || '<tr><td colspan="9" style="text-align:center">No pending dues! 🎉</td></tr>'}</tbody>
      </table>
    </div>

    <h3 style="margin-bottom: 1rem;">Recent Payment History</h3>
    <div class="card" style="overflow:hidden;">
      <table class="data-table">
        <thead><tr><th>Invoice</th><th>Unit</th><th>Amount</th><th>Mode</th><th>UTR</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>${filteredHistory?.map(p => {
          const sc = { Success:'success', 'Pending Verification':'warning', Failed:'danger', Refunded:'secondary' }[p.status] || '';
          return `<tr>
            <td>${p.invoices?.invoice_number || '—'}</td>
            <td>${p.units?.unit_number || '—'}</td>
            <td>₹${parseFloat(p.amount).toLocaleString('en-IN')}</td>
            <td>${p.payment_mode || '—'}</td>
            <td><small>${p.transaction_id || '—'}</small></td>
            <td><span class="badge badge-${sc}">${p.status}</span></td>
            <td><small>${new Date(p.created_at).toLocaleDateString('en-IN')}</small></td>
          </tr>`;
        }).join('') || '<tr><td colspan="7" style="text-align:center">No payment history found.</td></tr>'}</tbody>
      </table>
    </div>
  `;

  window._markPaid = (id, num, amt) => markPaidModal(id, num, amt);
  window._verifyPayment = (invId) => verifyPaymentModal(invId);
}

/* ==========================================================================
   2. EXPENSES TAB (Custom + Recurring)
   ========================================================================== */
async function renderExpenses(container) {
  // Fetch custom expenses
  const { data: customExpenses } = await supabase.from('expenses')
    .select('*, users!expenses_raised_by_fkey(name)')
    .eq('expense_type', 'custom')
    .order('created_at', { ascending: false });

  // Fetch recurring templates (secretary only)
  let recurringHtml = '';
  if (hasRole('secretary')) {
    const { data: recurringExpenses } = await supabase.from('recurring_expenses')
      .select('*')
      .order('created_at', { ascending: false });

    recurringHtml = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin: 2rem 0 1rem 0;">
        <h3>Recurring Expenses (Templates)</h3>
        <button class="btn btn-primary" id="btn-add-recurring"><i class="fa-solid fa-plus"></i> Add Recurring</button>
      </div>
      <div class="card" style="overflow:hidden;margin-bottom: 2rem;">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Description</th><th>Amount/Unit</th><th>Frequency</th><th>Status</th></tr></thead>
          <tbody>${recurringExpenses?.map(r => `<tr>
            <td><strong>${r.name}</strong></td>
            <td>${r.description || '—'}</td>
            <td>₹${parseFloat(r.amount).toLocaleString('en-IN')}</td>
            <td><span class="badge badge-info">${r.frequency}</span></td>
            <td><span class="badge badge-${r.is_active?'success':'secondary'}">${r.is_active?'Active':'Paused'}</span></td>
          </tr>`).join('') || '<tr><td colspan="5" style="text-align:center">No recurring templates setup.</td></tr>'}</tbody>
        </table>
      </div>
    `;
  }

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom: 1rem;">
      <h3>Custom Expenses</h3>
      <button class="btn btn-primary" id="btn-add-custom-expense"><i class="fa-solid fa-plus"></i> Raise Expense</button>
    </div>
    <div class="card" style="overflow:hidden;">
      <table class="data-table">
        <thead><tr><th>Date Raised</th><th>Name</th><th>Raised By</th><th>Amount</th><th>Due Date</th><th>Split</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${customExpenses?.map(e => {
          const sc = { Paid:'success', Approved:'info', Pending:'warning', Rejected:'danger' }[e.status] || '';
          return `<tr>
            <td>${new Date(e.created_at).toLocaleDateString('en-IN')}</td>
            <td><strong>${e.name}</strong><br><small style="color:var(--text-muted)">${e.category||'General'}</small></td>
            <td>${e.users?.name || '—'}</td>
            <td>₹${parseFloat(e.amount).toLocaleString('en-IN')}</td>
            <td>${e.due_date ? new Date(e.due_date).toLocaleDateString('en-IN') : '—'}</td>
            <td><span class="badge badge-neutral">${e.split_type}</span></td>
            <td><span class="badge badge-${sc}">${e.status}</span></td>
            <td>
              ${e.status === 'Pending' && hasRole('secretary') ? `
                <button class="btn btn-sm btn-primary" onclick="window._approveExpense('${e.id}')">Approve</button>
                <button class="btn btn-sm btn-danger" onclick="window._rejectExpense('${e.id}')">Reject</button>
              ` : ''}
              ${e.split_type !== 'none' ? `<button class="btn btn-sm btn-outline" onclick="window._viewSplits('${e.id}')">View Splits</button>` : ''}
            </td>
          </tr>`;
        }).join('') || '<tr><td colspan="8" style="text-align:center">No custom expenses raised.</td></tr>'}</tbody>
      </table>
    </div>
    ${recurringHtml}
  `;

  document.getElementById('btn-add-custom-expense')?.addEventListener('click', addCustomExpenseModal);
  if (hasRole('secretary')) {
    document.getElementById('btn-add-recurring')?.addEventListener('click', addRecurringExpenseModal);
  }

  window._approveExpense = async (id) => {
    const { error } = await supabase.from('expenses').update({ status: 'Approved', approved_by: currentUser.id, updated_at: new Date().toISOString() }).eq('id', id);
    if (!error) { showToast('Expense approved', 'success'); loadTab('expenses'); }
  };
  window._rejectExpense = async (id) => {
    const { error } = await supabase.from('expenses').update({ status: 'Rejected', updated_at: new Date().toISOString() }).eq('id', id);
    if (!error) { showToast('Expense rejected', 'info'); loadTab('expenses'); }
  };
  window._viewSplits = async (id) => {
    const { data } = await supabase.from('expense_splits').select('*, units(unit_number)').eq('expense_id', id);
    openModal('Expense Splits', `
      <table class="data-table">
        <thead><tr><th>Unit</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>
          ${data?.map(s => `<tr>
            <td>Unit ${s.units?.unit_number}</td>
            <td>₹${parseFloat(s.amount).toLocaleString('en-IN')}</td>
            <td><span class="badge badge-${s.status==='Paid'?'success':'warning'}">${s.status}</span></td>
          </tr>`).join('') || '<tr><td colspan="3">No splits generated yet.</td></tr>'}
        </tbody>
      </table>
    `, []);
  };
}

async function addCustomExpenseModal() {
  const { data: units } = await supabase.from('units').select('id, unit_number').eq('status', 'Occupied').order('unit_number');
  
  openModal('Raise Custom Expense', `
    <form id="custom-expense-form">
      <div class="form-group"><label class="form-label">Expense Name *</label><input name="name" class="form-control" required placeholder="e.g. Diwali Celebration"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Category</label><input name="category" class="form-control" placeholder="Event / Maintenance / Other"></div>
        <div class="form-group"><label class="form-label">Total Amount (₹) *</label><input name="amount" id="exp-total-amount" type="number" class="form-control" required></div>
      </div>
      <div class="form-group"><label class="form-label">Description *</label><textarea name="description" class="form-control" rows="2" required></textarea></div>
      <div class="form-group"><label class="form-label">Due Date</label><input name="due_date" type="date" class="form-control"></div>
      
      <hr style="border-color:var(--bg-panel-border);margin:1.5rem 0;">
      
      <div class="form-group"><label class="form-label">Split Among Units?</label>
        <select name="split_type" id="exp-split-type" class="form-control">
          <option value="none">Do not split (Society bears cost)</option>
          <option value="equal">Split equally among selected units</option>
          <option value="custom">Specify custom amount per unit</option>
        </select>
      </div>

      <div id="split-section" style="display:none; background:var(--bg-panel-hover); padding:1rem; border-radius:var(--radius-md);">
        <label class="form-label">Select Units to Include</label>
        <div style="max-height:200px; overflow-y:auto; display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;" id="split-units-list">
          ${units?.map(u => `
            <label style="display:flex;align-items:center;gap:.5rem;font-size:.9rem;background:var(--bg-panel);padding:.5rem;border-radius:4px;cursor:pointer;">
              <input type="checkbox" name="unit_ids" value="${u.id}" class="unit-checkbox" checked> Unit ${u.unit_number}
              <input type="number" name="custom_amt_${u.id}" class="form-control custom-amt-input" style="display:none;padding:.2rem;height:auto;" placeholder="₹ Amount">
            </label>
          `).join('')}
        </div>
      </div>
    </form>`,
    [{ label:'Submit Expense', class:'btn btn-primary', action: async()=>{
      const fd = new FormData(document.getElementById('custom-expense-form'));
      const obj = {
        name: fd.get('name'),
        category: fd.get('category'),
        description: fd.get('description'),
        amount: parseFloat(fd.get('amount')),
        due_date: fd.get('due_date') || null,
        split_type: fd.get('split_type'),
        expense_type: 'custom',
        raised_by: currentUser.id,
        created_by: currentUser.id
      };

      // Create expense
      const { data: newExp, error: expErr } = await supabase.from('expenses').insert(obj).select().single();
      if (expErr) { showToast(expErr.message, 'error'); return false; }

      // Handle Splits
      if (obj.split_type !== 'none') {
        const selectedUnits = fd.getAll('unit_ids');
        if (selectedUnits.length > 0) {
          const splits = [];
          const equalAmount = (obj.amount / selectedUnits.length).toFixed(2);
          
          for (const uid of selectedUnits) {
            let splitAmt = 0;
            if (obj.split_type === 'equal') {
              splitAmt = equalAmount;
            } else if (obj.split_type === 'custom') {
              splitAmt = parseFloat(fd.get(`custom_amt_${uid}`) || 0);
            }
            if (splitAmt > 0) {
              splits.push({ expense_id: newExp.id, unit_id: uid, amount: splitAmt });
            }
          }
          if (splits.length > 0) await supabase.from('expense_splits').insert(splits);
        }
      }
      showToast('Custom expense raised successfully!', 'success');
      closeModal(); loadTab('expenses');
    }}]
  );

  const splitSelect = document.getElementById('exp-split-type');
  const splitSection = document.getElementById('split-section');
  const customInputs = document.querySelectorAll('.custom-amt-input');
  
  splitSelect.addEventListener('change', () => {
    const val = splitSelect.value;
    splitSection.style.display = val === 'none' ? 'none' : 'block';
    customInputs.forEach(inp => inp.style.display = val === 'custom' ? 'block' : 'none');
  });
}

async function addRecurringExpenseModal() {
  openModal('Add Recurring Expense Template', `
    <form id="recurring-form">
      <div class="form-group"><label class="form-label">Template Name *</label><input name="name" class="form-control" required placeholder="e.g. Monthly Maintenance"></div>
      <div class="form-group"><label class="form-label">Description</label><textarea name="description" class="form-control" rows="2"></textarea></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Amount per Unit (₹) *</label><input name="amount" type="number" class="form-control" required></div>
        <div class="form-group"><label class="form-label">Frequency *</label>
          <select name="frequency" class="form-control">
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
      </div>
      <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.5rem;">
        <i class="fa-solid fa-info-circle"></i> This will automatically generate invoices for all occupied units at the specified frequency.
      </p>
    </form>`,
    [{ label:'Create Template', class:'btn btn-primary', action: async()=>{
      const fd = new FormData(document.getElementById('recurring-form'));
      const obj = {
        name: fd.get('name'),
        description: fd.get('description'),
        amount: parseFloat(fd.get('amount')),
        frequency: fd.get('frequency'),
        created_by: currentUser.id
      };
      const { error } = await supabase.from('recurring_expenses').insert(obj);
      if(error) { showToast(error.message, 'error'); return false; }
      showToast('Recurring template created!', 'success');
      closeModal(); loadTab('expenses');
    }}]
  );
}

/* ==========================================================================
   3. INVOICES TAB (Table & Exports)
   ========================================================================== */
async function renderInvoices(container) {
  let query = supabase.from('invoices')
    .select('*, units(unit_number), members(name)')
    .order('created_at', { ascending: false });
  
  if (!hasRole('secretary')) {
    query = query.eq('members.user_id', currentUser.id);
  }

  const { data: invoices } = await query;
  window._invoicesData = invoices || [];

  container.innerHTML = `
    <div class="page-toolbar" style="justify-content: flex-end; margin-bottom: 1rem; gap: 0.5rem;">
      <button class="btn btn-outline" id="btn-export-pdf"><i class="fa-solid fa-file-pdf"></i> Export PDF</button>
      <button class="btn btn-outline" id="btn-export-excel"><i class="fa-solid fa-file-excel"></i> Export Excel</button>
    </div>
    <div class="card" style="overflow:hidden;">
      <table class="data-table" id="invoices-table">
        <thead><tr><th>Invoice #</th><th>Unit</th><th>Type</th><th>Total</th><th>Due Date</th><th>Status</th></tr></thead>
        <tbody>${invoices?.map(inv => {
          const sc = { Paid:'success', Overdue:'danger', Pending:'warning', 'Pending Verification':'info', Cancelled:'secondary' }[inv.status] || '';
          return `<tr>
            <td><strong>${inv.invoice_number}</strong></td>
            <td>${inv.units?.unit_number || '—'}</td>
            <td>${inv.invoice_type}</td>
            <td>₹${parseFloat(inv.total_amount).toLocaleString('en-IN')}</td>
            <td>${new Date(inv.due_date).toLocaleDateString('en-IN')}</td>
            <td><span class="badge badge-${sc}">${inv.status}</span></td>
          </tr>`;
        }).join('') || '<tr><td colspan="6" style="text-align:center">No invoices found.</td></tr>'}</tbody>
      </table>
    </div>
  `;

  document.getElementById('btn-export-pdf')?.addEventListener('click', exportInvoicesPDF);
  document.getElementById('btn-export-excel')?.addEventListener('click', exportInvoicesExcel);
}

function exportInvoicesPDF() {
  if (!window.jspdf) return showToast('PDF library loading, please wait', 'warning');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  doc.setFontSize(18);
  doc.text('SocietyPro Invoices', 14, 22);
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);

  const head = [['Invoice #', 'Unit', 'Type', 'Total Amount', 'Due Date', 'Status']];
  const body = window._invoicesData.map(inv => [
    inv.invoice_number,
    inv.units?.unit_number || '-',
    inv.invoice_type,
    `Rs. ${parseFloat(inv.total_amount).toFixed(2)}`,
    new Date(inv.due_date).toLocaleDateString(),
    inv.status
  ]);

  doc.autoTable({
    startY: 36,
    head: head,
    body: body,
    theme: 'striped',
    headStyles: { fillColor: [228, 168, 83] }, // Primary accent color
  });

  doc.save(`Invoices_${new Date().getTime()}.pdf`);
}

function exportInvoicesExcel() {
  if (!window.XLSX) return showToast('Excel library loading, please wait', 'warning');
  
  const data = window._invoicesData.map(inv => ({
    'Invoice Number': inv.invoice_number,
    'Unit': inv.units?.unit_number || '-',
    'Resident': inv.members?.name || '-',
    'Type': inv.invoice_type,
    'Base Amount': parseFloat(inv.amount),
    'Penalty': parseFloat(inv.penalty || 0),
    'Total Amount': parseFloat(inv.total_amount),
    'Due Date': new Date(inv.due_date).toLocaleDateString(),
    'Status': inv.status
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Invoices");
  XLSX.writeFile(wb, `Invoices_${new Date().getTime()}.xlsx`);
}

/* ==========================================================================
   4. REPORTS TAB (Admin Only)
   ========================================================================== */
async function renderReports(container) {
  container.innerHTML = `
    <div style="display:flex; gap:1rem; margin-bottom:1.5rem; align-items:flex-end;">
      <div class="form-group" style="margin-bottom:0; flex:1; max-width:200px;">
        <label class="form-label">Report Period</label>
        <select id="report-period" class="form-control">
          <option value="monthly">This Month</option>
          <option value="quarterly">This Quarter</option>
          <option value="yearly">This Year</option>
        </select>
      </div>
      <button class="btn btn-primary" id="btn-generate-report"><i class="fa-solid fa-rotate"></i> Generate</button>
      <div style="flex:1;"></div>
      <button class="btn btn-outline" id="btn-download-report-pdf" disabled><i class="fa-solid fa-download"></i> Download PDF</button>
    </div>

    <div id="report-results" style="display:none;">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem;margin-bottom:1.5rem;">
        <div class="card stat-card"><div class="stat-value" style="color:var(--status-success)" id="rep-income">₹0</div><div class="stat-label">Total Income</div></div>
        <div class="card stat-card"><div class="stat-value" style="color:var(--status-danger)" id="rep-expense">₹0</div><div class="stat-label">Total Expenses</div></div>
        <div class="card stat-card"><div class="stat-value" style="color:var(--status-warning)" id="rep-pending">₹0</div><div class="stat-label">Pending Dues</div></div>
      </div>
      <div class="card">
        <h3 style="margin-bottom:1rem;">Financial Summary</h3>
        <canvas id="reportChart" height="100"></canvas>
      </div>
    </div>
  `;

  let reportChartInstance = null;

  document.getElementById('btn-generate-report').addEventListener('click', async () => {
    const period = document.getElementById('report-period').value;
    const now = new Date();
    let startDateStr = '';

    if (period === 'monthly') {
      startDateStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    } else if (period === 'quarterly') {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      startDateStr = new Date(now.getFullYear(), qStartMonth, 1).toISOString();
    } else {
      startDateStr = new Date(now.getFullYear(), 0, 1).toISOString();
    }

    const [incomeData, expenseData, pendingData] = await Promise.all([
      supabase.from('payments').select('amount').eq('status', 'Success').gte('paid_at', startDateStr),
      supabase.from('expenses').select('amount').in('status', ['Approved','Paid']).gte('expense_date', startDateStr.split('T')[0]),
      supabase.from('invoices').select('total_amount').in('status', ['Pending','Overdue','Pending Verification']).gte('created_at', startDateStr)
    ]);

    const totalIn  = incomeData.data?.reduce((s,p) => s + parseFloat(p.amount||0), 0) || 0;
    const totalOut = expenseData.data?.reduce((s,e) => s + parseFloat(e.amount||0), 0) || 0;
    const totalPen = pendingData.data?.reduce((s,i) => s + parseFloat(i.total_amount||0), 0) || 0;

    document.getElementById('rep-income').textContent = `₹${totalIn.toLocaleString('en-IN')}`;
    document.getElementById('rep-expense').textContent = `₹${totalOut.toLocaleString('en-IN')}`;
    document.getElementById('rep-pending').textContent = `₹${totalPen.toLocaleString('en-IN')}`;
    
    document.getElementById('report-results').style.display = 'block';
    document.getElementById('btn-download-report-pdf').disabled = false;

    // Update Chart
    const ctx = document.getElementById('reportChart').getContext('2d');
    if (reportChartInstance) reportChartInstance.destroy();
    
    reportChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Income', 'Expenses', 'Pending Dues'],
        datasets: [{
          label: 'Amount (₹)',
          data: [totalIn, totalOut, totalPen],
          backgroundColor: ['rgba(16, 185, 129, 0.5)', 'rgba(239, 68, 68, 0.5)', 'rgba(245, 158, 11, 0.5)'],
          borderColor: ['#10b981', '#ef4444', '#f59e0b'],
          borderWidth: 1
        }]
      },
      options: {
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { display: false } }
      }
    });

    // Wire PDF export for report
    document.getElementById('btn-download-report-pdf').onclick = () => {
      if (!window.jspdf) return;
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      doc.setFontSize(20);
      doc.text('SocietyPro Financial Report', 14, 22);
      doc.setFontSize(12);
      doc.text(`Period: ${period.charAt(0).toUpperCase() + period.slice(1)} (From ${new Date(startDateStr).toLocaleDateString()})`, 14, 30);
      
      doc.autoTable({
        startY: 40,
        head: [['Metric', 'Amount (Rs)']],
        body: [
          ['Total Income', totalIn.toFixed(2)],
          ['Total Expenses', totalOut.toFixed(2)],
          ['Pending Dues', totalPen.toFixed(2)],
          ['Net Balance', (totalIn - totalOut).toFixed(2)]
        ],
        theme: 'grid'
      });
      doc.save(`Society_Report_${period}_${new Date().getTime()}.pdf`);
    };
  });
}

/* ==========================================================================
   HELPERS
   ========================================================================== */
async function markPaidModal(invoiceId, invoiceNumber, amount) {
  openModal('Mark as Paid', `
    <p>Record payment for invoice <strong>${invoiceNumber}</strong> (₹${parseFloat(amount).toLocaleString('en-IN')})</p>
    <form id="pay-form">
      <div class="form-group"><label class="form-label">Payment Mode *</label>
        <select name="payment_mode" class="form-control" required>
          <option>UPI</option><option>NEFT</option><option>RTGS</option><option>Cheque</option><option>Cash</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Transaction ID / Reference *</label>
        <input name="transaction_id" class="form-control" required placeholder="UPI Ref or UTR number">
      </div>
    </form>
    <div class="alert-info" style="background:var(--bg-secondary);border-radius:8px;padding:.75rem;margin-top:.5rem;font-size:.85rem;">
      <i class="fa-solid fa-info-circle"></i> Payment will be verified by admin within 24 hours.
    </div>`,
    [{ label:'Submit', class:'btn btn-primary', action: async()=>{
      const fd = new FormData(document.getElementById('pay-form'));
      const obj = Object.fromEntries(fd);
      const { data: inv } = await supabase.from('invoices').select('unit_id,member_id').eq('id', invoiceId).single();
      
      const { error } = await supabase.from('payments').insert({
        invoice_id: invoiceId,
        unit_id: inv.unit_id,
        member_id: inv.member_id,
        amount,
        payment_mode: obj.payment_mode,
        transaction_id: obj.transaction_id,
        status: 'Pending Verification',
        submitted_by: currentUser.id
      });
      
      if(error){showToast(error.message,'error');return false;}
      await supabase.from('invoices').update({status:'Pending Verification',updated_at:new Date().toISOString()}).eq('id',invoiceId);
      showToast('Payment submitted for verification.','success');
      closeModal(); loadTab('payments');
    }}]
  );
}

async function verifyPaymentModal(invoiceId) {
  const { data: payments } = await supabase.from('payments').select('*').eq('invoice_id', invoiceId).eq('status', 'Pending Verification');
  const p = payments?.[0];
  if(!p) { showToast('Payment not found','error'); return; }

  openModal('Verify Payment', `
    <table class="data-table"><tbody>
      <tr><td>Mode</td><td><strong>${p.payment_mode}</strong></td></tr>
      <tr><td>Reference</td><td><strong>${p.transaction_id||'—'}</strong></td></tr>
      <tr><td>Amount</td><td><strong>₹${parseFloat(p.amount).toLocaleString('en-IN')}</strong></td></tr>
    </tbody></table>`,
    [
      { label:'Approve', class:'btn btn-primary', action: async()=>{
        const now = new Date().toISOString();
        await supabase.from('payments').update({status:'Success',verified_by:currentUser.id,verified_at:now,paid_at:now}).eq('id',p.id);
        await supabase.from('invoices').update({status:'Paid',updated_at:now}).eq('id',invoiceId);
        showToast('Payment verified!','success'); closeModal(); loadTab('payments');
      }},
      { label:'Reject', class:'btn btn-danger', action: async()=>{
        await supabase.from('payments').update({status:'Failed'}).eq('id',p.id);
        await supabase.from('invoices').update({status:'Pending',updated_at:new Date().toISOString()}).eq('id',invoiceId);
        showToast('Payment rejected.','warning'); closeModal(); loadTab('payments');
      }}
    ]
  );
}
