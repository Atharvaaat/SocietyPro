/**
 * Dashboard Module
 * frontend/modules/dashboard/dashboard.js
 */
import { supabase } from '../../lib/supabase.js';
import { currentUser, currentRole } from '../auth/auth.js';

export async function render(container) {
  container.innerHTML = `
    <div class="animate-fade-in">
      <div class="stats-grid" id="kpi-grid">
        ${[...Array(6)].map(() => `<div class="card stat-card skeleton"></div>`).join('')}
      </div>
      <div class="grid-2col" style="margin-top:1.5rem;gap:1.5rem;">
        <div class="card" id="recent-payments-card">
          <h3 class="card-title"><i class="fa-solid fa-receipt"></i> Recent Payments</h3>
          <div id="recent-payments-list"><div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin"></i></div></div>
        </div>
        <div class="card" id="recent-tickets-card">
          <h3 class="card-title"><i class="fa-solid fa-headset"></i> Open Tickets</h3>
          <div id="recent-tickets-list"><div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin"></i></div></div>
        </div>
      </div>
    </div>`;

  await loadKPIs();
}

async function loadKPIs() {
  const [units, pendingInv, openTickets, todayVisitors, expiringAssets, thisMonthPay] =
    await Promise.all([
      supabase.from('units').select('status', { count: 'exact' }),
      supabase.from('invoices').select('total_amount').in('status', ['Pending','Overdue','Pending Verification']),
      supabase.from('tickets').select('id', { count: 'exact' }).not('status', 'in', '("Resolved","Closed")'),
      supabase.from('visitors').select('id', { count: 'exact' }).gte('check_in', new Date().toISOString().split('T')[0]),
      supabase.from('assets').select('id', { count: 'exact' }).lte('amc_expiry', new Date(Date.now() + 30*864e5).toISOString().split('T')[0]),
      supabase.from('payments').select('amount').eq('status', 'Success')
        .gte('paid_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    ]);

  const totalUnits    = units.data?.length || 0;
  const occupied      = units.data?.filter(u => u.status === 'Occupied').length || 0;
  const pendingAmt    = pendingInv.data?.reduce((s, i) => s + parseFloat(i.total_amount||0), 0) || 0;
  const collectedMo   = thisMonthPay.data?.reduce((s, p) => s + parseFloat(p.amount||0), 0) || 0;

  const kpis = [
    { icon: 'fa-building',           label: 'Total Units',        value: totalUnits,  sub: `${occupied} Occupied` },
    { icon: 'fa-percent',            label: 'Occupancy',          value: totalUnits ? `${Math.round(occupied*100/totalUnits)}%` : '—', sub: `${totalUnits - occupied} Vacant` },
    { icon: 'fa-indian-rupee-sign',  label: 'Collected (Month)',  value: `₹${collectedMo.toLocaleString('en-IN')}`, sub: 'Current month' },
    { icon: 'fa-clock',              label: 'Pending Dues',       value: `₹${pendingAmt.toLocaleString('en-IN')}`, sub: `${pendingInv.data?.length || 0} invoices` },
    { icon: 'fa-headset',            label: 'Open Tickets',       value: openTickets.count || 0, sub: 'Awaiting resolution' },
    { icon: 'fa-person-walking-arrow-right', label: "Today's Visitors", value: todayVisitors.count || 0, sub: 'Checked in today' },
  ];

  document.getElementById('kpi-grid').innerHTML = kpis.map(k => `
    <div class="card stat-card">
      <div class="stat-icon"><i class="fa-solid ${k.icon}"></i></div>
      <div class="stat-info">
        <div class="stat-value">${k.value}</div>
        <div class="stat-label">${k.label}</div>
        <div class="stat-sub">${k.sub}</div>
      </div>
    </div>`).join('');

  // Recent payments
  const { data: payments } = await supabase.from('payments')
    .select('*, units(unit_number), members(name)')
    .eq('status', 'Success').order('paid_at', { ascending: false }).limit(5);

  document.getElementById('recent-payments-list').innerHTML = payments?.length
    ? `<table class="data-table"><tbody>${payments.map(p => `
        <tr>
          <td><strong>Unit ${p.units?.unit_number}</strong><br><small>${p.members?.name || '—'}</small></td>
          <td>₹${parseFloat(p.amount).toLocaleString('en-IN')}</td>
          <td><span class="badge badge-success">${p.payment_mode}</span></td>
          <td><small>${new Date(p.paid_at).toLocaleDateString('en-IN')}</small></td>
        </tr>`).join('')}</tbody></table>`
    : '<p style="color:var(--text-muted);padding:1rem;">No payments yet.</p>';

  // Recent open tickets
  const { data: tickets } = await supabase.from('tickets')
    .select('*, units(unit_number)')
    .not('status', 'in', '("Resolved","Closed")')
    .order('created_at', { ascending: false }).limit(5);

  document.getElementById('recent-tickets-list').innerHTML = tickets?.length
    ? `<table class="data-table"><tbody>${tickets.map(t => `
        <tr>
          <td><strong>${t.ticket_number}</strong><br><small>${t.category}</small></td>
          <td>Unit ${t.units?.unit_number || '—'}</td>
          <td><span class="badge badge-${t.priority === 'Urgent' ? 'danger' : 'warning'}">${t.priority}</span></td>
          <td><span class="badge">${t.status}</span></td>
        </tr>`).join('')}</tbody></table>`
    : '<p style="color:var(--text-muted);padding:1rem;">No open tickets.</p>';
}
