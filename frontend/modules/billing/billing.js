/**
 * Billing & Finance Module — Invoices, Payments, Expenses
 * frontend/modules/billing/billing.js
 */
import { supabase, callBackend } from '../../lib/supabase.js';
import { hasRole, currentUser } from '../auth/auth.js';
import { showToast, openModal, closeModal } from '../../lib/ui.js';

export async function render(container) {
  container.innerHTML = `
    <div class="animate-fade-in">
      <div class="tab-bar">
        <button class="tab-btn active" data-tab="invoices">Invoices</button>
        <button class="tab-btn" data-tab="payments">Payments</button>
        <button class="tab-btn" data-tab="expenses">Expenses</button>
        ${hasRole('secretary','treasurer') ? `<button class="tab-btn" data-tab="reports">Reports</button>` : ''}
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
  loadTab('invoices');
}

async function loadTab(tab) {
  const content = document.getElementById('billing-content');
  content.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';
  if (tab === 'invoices') await renderInvoices(content);
  else if (tab === 'payments') await renderPayments(content);
  else if (tab === 'expenses') await renderExpenses(content);
  else if (tab === 'reports') await renderReports(content);
}

/* ── INVOICES ── */
async function renderInvoices(container) {
  const { data: invoices } = await supabase.from('invoices')
    .select('*, units(unit_number), members(name,email,phone)')
    .order('created_at', { ascending: false }).limit(50);

  container.innerHTML = `
    <div class="page-toolbar">
      ${hasRole('secretary','treasurer') ? `
      <button class="btn btn-primary" id="btn-create-inv"><i class="fa-solid fa-plus"></i> Create Invoice</button>
      <button class="btn btn-outline" id="btn-bulk-inv"><i class="fa-solid fa-layer-group"></i> Bulk Generate</button>` : ''}
    </div>
    <div class="card" style="overflow:hidden;margin-top:1rem;">
      <table class="data-table">
        <thead><tr><th>Invoice #</th><th>Unit</th><th>Type</th><th>Amount</th><th>Due Date</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${invoices?.map(inv => {
          const sc = { Paid:'success', Overdue:'danger', Pending:'warning', 'Pending Verification':'info', Cancelled:'secondary' }[inv.status] || '';
          return `<tr>
            <td><strong>${inv.invoice_number}</strong></td>
            <td>${inv.units?.unit_number || '—'}</td>
            <td>${inv.invoice_type}</td>
            <td>₹${parseFloat(inv.total_amount).toLocaleString('en-IN')}</td>
            <td>${new Date(inv.due_date).toLocaleDateString('en-IN')}</td>
            <td><span class="badge badge-${sc}">${inv.status}</span></td>
            <td>
              ${inv.status !== 'Paid' && inv.status !== 'Cancelled' ? `
                <button class="btn btn-sm btn-outline" onclick="window._markPaid('${inv.id}','${inv.invoice_number}',${inv.total_amount})">
                  Mark Paid
                </button>` : ''}
              ${hasRole('secretary','treasurer') && inv.status === 'Pending Verification' ? `
                <button class="btn btn-sm btn-primary" onclick="window._verifyPayment('${inv.id}')">
                  Verify
                </button>` : ''}
            </td>
          </tr>`;
        }).join('') || '<tr><td colspan="7" style="text-align:center">No invoices found.</td></tr>'}</tbody>
      </table>
    </div>`;

  document.getElementById('btn-create-inv')?.addEventListener('click', createInvoiceModal);
  document.getElementById('btn-bulk-inv')?.addEventListener('click', bulkGenerateModal);

  window._markPaid = (id, num, amt) => markPaidModal(id, num, amt);
  window._verifyPayment = (invId) => verifyPaymentModal(invId);
}

async function createInvoiceModal() {
  const { data: units } = await supabase.from('units').select('id,unit_number').eq('status','Occupied').order('unit_number');
  openModal('Create Invoice', `
    <form id="inv-form">
      <div class="form-group"><label class="form-label">Unit *</label>
        <select name="unit_id" class="form-control" required>
          <option value="">Select unit…</option>
          ${units?.map(u=>`<option value="${u.id}">${u.unit_number}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Invoice Type *</label>
        <input name="invoice_type" class="form-control" required placeholder="Monthly Maintenance">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Amount (₹) *</label><input name="amount" type="number" class="form-control" required></div>
        <div class="form-group"><label class="form-label">Due Date *</label><input name="due_date" type="date" class="form-control" required></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea name="notes" class="form-control" rows="2"></textarea></div>
    </form>`,
    [{ label:'Create', class:'btn btn-primary', action: async()=>{
      const fd=new FormData(document.getElementById('inv-form'));
      const obj=Object.fromEntries(fd);
      const invNum=`INV-${String(Date.now()).slice(-6)}`;
      const {error}=await supabase.from('invoices').insert({...obj,invoice_number:invNum,created_by:currentUser.id});
      if(error){showToast(error.message,'error');return false;}
      // Trigger email notification
      try { await callBackend('/api/notify/email',{ to: 'resident@example.com', subject:`Invoice ${invNum}`, html:`<p>Your invoice ${invNum} for ₹${obj.amount} is due on ${obj.due_date}.</p>` }); } catch{}
      showToast('Invoice created!','success'); closeModal(); renderInvoices(document.getElementById('billing-content'));
    }}]
  );
}

async function bulkGenerateModal() {
  openModal('Bulk Generate Monthly Invoices', `
    <form id="bulk-form">
      <div class="form-group"><label class="form-label">Billing Month</label><input name="billing_month" type="month" class="form-control" required></div>
      <div class="form-group"><label class="form-label">Due Date</label><input name="due_date" type="date" class="form-control" required></div>
      <div class="form-group"><label class="form-label">Rate per sqft (₹)</label><input name="rate" type="number" class="form-control" value="3.50" step="0.5"></div>
    </form>`,
    [{ label:'Generate', class:'btn btn-primary', action: async()=>{
      const fd=new FormData(document.getElementById('bulk-form'));
      const {billing_month,due_date,rate}=Object.fromEntries(fd);
      const {data:units}=await supabase.from('units').select('id,unit_number,area_sqft,members(id,name,email)').eq('status','Occupied');
      let created=0, skipped=0;
      for(const u of units||[]){
        const {data:exists}=await supabase.from('invoices').select('id').eq('unit_id',u.id).eq('billing_month',billing_month+'-01').eq('invoice_type','Monthly Maintenance');
        if(exists?.length){skipped++;continue;}
        const amount=Math.round((u.area_sqft||0)*parseFloat(rate));
        const invNum=`INV-${String(Date.now()+Math.random()).slice(-6)}`;
        await supabase.from('invoices').insert({invoice_number:invNum,unit_id:u.id,invoice_type:'Monthly Maintenance',billing_month:billing_month+'-01',amount,due_date,created_by:currentUser.id});
        created++;
      }
      showToast(`Created ${created}, skipped ${skipped}`,'success');
      closeModal(); renderInvoices(document.getElementById('billing-content'));
    }}]
  );
}

/** Resident marks invoice paid — submits UTR/ref */
async function markPaidModal(invoiceId, invoiceNumber, amount) {
  openModal('Mark as Paid', `
    <p>Record your payment for invoice <strong>${invoiceNumber}</strong> (₹${parseFloat(amount).toLocaleString('en-IN')})</p>
    <form id="pay-form">
      <div class="form-group"><label class="form-label">Payment Mode *</label>
        <select name="payment_mode" class="form-control" required>
          <option>UPI</option><option>NEFT</option><option>RTGS</option><option>Cheque</option><option>Cash</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Transaction ID / UTR / Reference *</label>
        <input name="transaction_id" class="form-control" required placeholder="UPI Ref or UTR number">
      </div>
      <div class="form-group"><label class="form-label">Payment Date *</label>
        <input name="paid_date" type="date" class="form-control" required value="${new Date().toISOString().split('T')[0]}">
      </div>
    </form>
    <div class="alert-info" style="background:var(--bg-secondary);border-radius:8px;padding:.75rem;margin-top:.5rem;font-size:.85rem;">
      <i class="fa-solid fa-info-circle"></i> Your payment will be verified by the admin within 24 hours.
    </div>`,
    [{ label:'Submit for Verification', class:'btn btn-primary', action: async()=>{
      const fd=new FormData(document.getElementById('pay-form'));
      const obj=Object.fromEntries(fd);
      const {data:inv}=await supabase.from('invoices').select('unit_id,member_id').eq('id',invoiceId).single();
      const {error}=await supabase.from('payments').insert({
        invoice_id: invoiceId,
        unit_id: inv.unit_id,
        member_id: inv.member_id,
        amount,
        payment_mode: obj.payment_mode,
        transaction_id: obj.transaction_id,
        status: 'Pending Verification',
        submitted_by: currentUser.id,
        submitted_at: new Date().toISOString()
      });
      if(error){showToast(error.message,'error');return false;}
      await supabase.from('invoices').update({status:'Pending Verification',updated_at:new Date().toISOString()}).eq('id',invoiceId);
      showToast('Payment submitted! Awaiting admin verification.','success');
      closeModal(); renderInvoices(document.getElementById('billing-content'));
    }}]
  );
}

/** Admin verifies a pending payment */
async function verifyPaymentModal(invoiceId) {
  const {data:payments}=await supabase.from('payments').select('*').eq('invoice_id',invoiceId).eq('status','Pending Verification');
  const p=payments?.[0];
  if(!p){showToast('Payment not found','error');return;}
  openModal('Verify Payment', `
    <table class="data-table"><tbody>
      <tr><td>Payment Mode</td><td><strong>${p.payment_mode}</strong></td></tr>
      <tr><td>Transaction ID / UTR</td><td><strong>${p.transaction_id||'—'}</strong></td></tr>
      <tr><td>Amount</td><td><strong>₹${parseFloat(p.amount).toLocaleString('en-IN')}</strong></td></tr>
      <tr><td>Submitted</td><td>${new Date(p.submitted_at).toLocaleString('en-IN')}</td></tr>
    </tbody></table>
    <p style="margin-top:1rem;">Confirm you have received this payment before approving.</p>`,
    [
      { label:'Approve & Close', class:'btn btn-primary', action: async()=>{
        const now=new Date().toISOString();
        await supabase.from('payments').update({status:'Success',verified_by:currentUser.id,verified_at:now,paid_at:now}).eq('id',p.id);
        await supabase.from('invoices').update({status:'Paid',updated_at:now}).eq('id',invoiceId);
        // Notify resident
        const {data:inv}=await supabase.from('invoices').select('invoice_number,members(email,name,phone)').eq('id',invoiceId).single();
        if(inv?.members?.email) try{await callBackend('/api/notify/email',{to:inv.members.email,subject:`Payment Confirmed — ${inv.invoice_number}`,html:`<p>Dear ${inv.members.name}, your payment has been verified. Thank you!</p>`});}catch{}
        if(inv?.members?.phone) try{await callBackend('/api/notify/sms',{phone:inv.members.phone,message:`Payment for ${inv.invoice_number} confirmed. Thank you! - SocietyPro`});}catch{}
        showToast('Payment verified!','success'); closeModal(); renderInvoices(document.getElementById('billing-content'));
      }},
      { label:'Reject', class:'btn btn-danger', action: async()=>{
        await supabase.from('payments').update({status:'Failed'}).eq('id',p.id);
        await supabase.from('invoices').update({status:'Pending',updated_at:new Date().toISOString()}).eq('id',invoiceId);
        showToast('Payment rejected — invoice reset to Pending.','warning');
        closeModal(); renderInvoices(document.getElementById('billing-content'));
      }}
    ]
  );
}

/* ── PAYMENTS ── */
async function renderPayments(container) {
  const {data:payments}=await supabase.from('payments')
    .select('*,units(unit_number),members(name),invoices(invoice_number)')
    .order('created_at',{ascending:false}).limit(50);
  container.innerHTML=`<div class="card" style="overflow:hidden;">
    <table class="data-table">
      <thead><tr><th>Invoice</th><th>Unit</th><th>Resident</th><th>Amount</th><th>Mode</th><th>UTR</th><th>Status</th><th>Date</th></tr></thead>
      <tbody>${payments?.map(p=>{
        const sc={Success:'success','Pending Verification':'warning',Failed:'danger',Refunded:'secondary'}[p.status]||'';
        return `<tr>
          <td>${p.invoices?.invoice_number||'—'}</td>
          <td>${p.units?.unit_number||'—'}</td>
          <td>${p.members?.name||'—'}</td>
          <td>₹${parseFloat(p.amount).toLocaleString('en-IN')}</td>
          <td>${p.payment_mode||'—'}</td>
          <td><small>${p.transaction_id||'—'}</small></td>
          <td><span class="badge badge-${sc}">${p.status}</span></td>
          <td><small>${p.paid_at?new Date(p.paid_at).toLocaleDateString('en-IN'):new Date(p.created_at).toLocaleDateString('en-IN')}</small></td>
        </tr>`;
      }).join('')||'<tr><td colspan="8" style="text-align:center">No payments.</td></tr>'}</tbody>
    </table></div>`;
}

/* ── EXPENSES ── */
async function renderExpenses(container) {
  const {data:expenses}=await supabase.from('expenses')
    .select('*,vendors(name)').order('expense_date',{ascending:false}).limit(50);
  container.innerHTML=`
    <div class="page-toolbar">
      ${hasRole('secretary','treasurer','manager')?`<button class="btn btn-primary" id="btn-add-exp"><i class="fa-solid fa-plus"></i> Add Expense</button>`:''}
    </div>
    <div class="card" style="overflow:hidden;margin-top:1rem;">
      <table class="data-table">
        <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Vendor</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${expenses?.map(e=>{
          const sc={Paid:'success',Pending:'warning',Rejected:'danger'}[e.status]||'';
          return `<tr>
            <td>${new Date(e.expense_date).toLocaleDateString('en-IN')}</td>
            <td>${e.category}</td>
            <td>${e.description}</td>
            <td>${e.vendors?.name||'—'}</td>
            <td>₹${parseFloat(e.amount).toLocaleString('en-IN')}</td>
            <td><span class="badge badge-${sc}">${e.status}</span></td>
            <td>${hasRole('secretary','treasurer')&&e.status==='Pending'?`<button class="btn btn-sm btn-primary" onclick="window._approveExp('${e.id}')">Approve</button>`:''}
            </td>
          </tr>`;
        }).join('')||'<tr><td colspan="7" style="text-align:center">No expenses.</td></tr>'}</tbody>
      </table>
    </div>`;
  document.getElementById('btn-add-exp')?.addEventListener('click', addExpenseModal);
  window._approveExp = async(id)=>{
    const {error}=await supabase.from('expenses').update({status:'Paid',approved_by:currentUser.id,updated_at:new Date().toISOString()}).eq('id',id);
    if(error){showToast(error.message,'error');return;}
    showToast('Expense approved!','success'); renderExpenses(document.getElementById('billing-content'));
  };
}

async function addExpenseModal() {
  openModal('Record Expense', `
    <form id="exp-form">
      <div class="form-group"><label class="form-label">Category</label><input name="category" class="form-control" placeholder="Maintenance / Security / Utilities"></div>
      <div class="form-group"><label class="form-label">Description *</label><input name="description" class="form-control" required></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Amount (₹) *</label><input name="amount" type="number" class="form-control" required></div>
        <div class="form-group"><label class="form-label">Date *</label><input name="expense_date" type="date" class="form-control" required value="${new Date().toISOString().split('T')[0]}"></div>
      </div>
    </form>`,
    [{ label:'Record', class:'btn btn-primary', action: async()=>{
      const fd=new FormData(document.getElementById('exp-form'));
      const {error}=await supabase.from('expenses').insert({...Object.fromEntries(fd),created_by:currentUser.id});
      if(error){showToast(error.message,'error');return false;}
      showToast('Expense recorded!','success'); closeModal(); renderExpenses(document.getElementById('billing-content'));
    }}]
  );
}

/* ── REPORTS ── */
async function renderReports(container) {
  const month=new Date().toISOString().slice(0,7);
  const [income,spent,pending]=await Promise.all([
    supabase.from('payments').select('amount').eq('status','Success').gte('paid_at',month+'-01'),
    supabase.from('expenses').select('amount').eq('status','Paid').gte('expense_date',month+'-01'),
    supabase.from('invoices').select('total_amount').in('status',['Pending','Overdue','Pending Verification'])
  ]);
  const totalIn  = income.data?.reduce((s,p)=>s+parseFloat(p.amount||0),0)||0;
  const totalOut = spent.data?.reduce((s,e)=>s+parseFloat(e.amount||0),0)||0;
  const totalPen = pending.data?.reduce((s,i)=>s+parseFloat(i.total_amount||0),0)||0;
  container.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem;margin-bottom:1.5rem;">
      <div class="card stat-card"><div class="stat-value" style="color:var(--status-success)">₹${totalIn.toLocaleString('en-IN')}</div><div class="stat-label">Income (This Month)</div></div>
      <div class="card stat-card"><div class="stat-value" style="color:var(--status-danger)">₹${totalOut.toLocaleString('en-IN')}</div><div class="stat-label">Expenses (This Month)</div></div>
      <div class="card stat-card"><div class="stat-value" style="color:var(--status-warning)">₹${totalPen.toLocaleString('en-IN')}</div><div class="stat-label">Pending Dues</div></div>
    </div>
    <div class="card stat-card"><div class="stat-value">₹${(totalIn-totalOut).toLocaleString('en-IN')}</div><div class="stat-label">Net Surplus / Deficit</div></div>`;
}
