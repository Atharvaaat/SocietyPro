/**
 * Notifications Module — Admin Console
 * View notification queue, flush pending, resend failed, cancel pending
 */
import { supabase, callBackend } from '../../lib/supabase.js';
import { showToast, openModal, closeModal } from '../../lib/ui.js';

export async function render(container) {
  container.innerHTML = `
    <div class="animate-fade-in">
      <div class="stats-grid" id="notif-stats" style="margin-bottom:1.5rem;"></div>
      <div class="page-toolbar">
        <select id="notif-status-filter" class="form-control" style="width:auto;">
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select id="notif-type-filter" class="form-control" style="width:auto;">
          <option value="">All Types</option>
          <option value="expense">Expense</option>
          <option value="payment">Payment</option>
          <option value="ticket">Ticket</option>
          <option value="penalty">Penalty</option>
          <option value="reminder">Reminder</option>
          <option value="general">General</option>
        </select>
        <div style="flex:1;"></div>
        <button class="btn btn-primary" id="btn-flush-queue"><i class="fa-solid fa-paper-plane"></i> Flush Queue</button>
        <button class="btn btn-outline" id="btn-compose"><i class="fa-solid fa-pen"></i> Compose</button>
      </div>
      <div class="card" style="overflow:hidden;margin-top:1rem;" id="notif-table-wrap"></div>
    </div>`;

  await loadStats();
  await loadQueue();

  document.getElementById('notif-status-filter')?.addEventListener('change', loadQueue);
  document.getElementById('notif-type-filter')?.addEventListener('change', loadQueue);
  document.getElementById('btn-flush-queue')?.addEventListener('click', flushQueue);
  document.getElementById('btn-compose')?.addEventListener('click', composeModal);
}

async function loadStats() {
  const { data: all } = await supabase.from('notifications').select('status');
  const counts = { pending: 0, sent: 0, failed: 0, cancelled: 0 };
  all?.forEach(n => counts[n.status] = (counts[n.status] || 0) + 1);

  document.getElementById('notif-stats').innerHTML = `
    <div class="card stat-card"><div class="stat-icon" style="background:#fef3c7;color:#92400e;"><i class="fa-solid fa-clock"></i></div><div><div class="stat-value">${counts.pending}</div><div class="stat-label">Pending</div></div></div>
    <div class="card stat-card"><div class="stat-icon" style="background:#d1fae5;color:#065f46;"><i class="fa-solid fa-check"></i></div><div><div class="stat-value">${counts.sent}</div><div class="stat-label">Sent</div></div></div>
    <div class="card stat-card"><div class="stat-icon" style="background:#fee2e2;color:#991b1b;"><i class="fa-solid fa-xmark"></i></div><div><div class="stat-value">${counts.failed}</div><div class="stat-label">Failed</div></div></div>
    <div class="card stat-card"><div class="stat-icon" style="background:#e0e7ff;color:#3730a3;"><i class="fa-solid fa-ban"></i></div><div><div class="stat-value">${counts.cancelled}</div><div class="stat-label">Cancelled</div></div></div>`;
}

async function loadQueue() {
  const status = document.getElementById('notif-status-filter')?.value;
  const type = document.getElementById('notif-type-filter')?.value;

  let q = supabase.from('notifications')
    .select('*, users:user_id(name, telegram_chat_id)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (status) q = q.eq('status', status);
  if (type) q = q.eq('type', type);

  const { data: notifications } = await q;
  const wrap = document.getElementById('notif-table-wrap');

  wrap.innerHTML = `<table class="data-table">
    <thead><tr><th>Time</th><th>Recipient</th><th>Type</th><th>Title</th><th>Channel</th><th>Status</th><th>Attempts</th><th>Actions</th></tr></thead>
    <tbody>${notifications?.map(n => {
      const sc = { pending:'warning', sent:'success', failed:'danger', cancelled:'secondary' }[n.status] || '';
      return `<tr>
        <td><small>${new Date(n.created_at).toLocaleString('en-IN')}</small></td>
        <td>${n.users?.name || '—'}<br><small style="color:var(--text-muted)">${n.users?.telegram_chat_id || 'No TG ID'}</small></td>
        <td><span class="badge badge-info">${n.type}</span></td>
        <td><strong>${n.title}</strong><br><small style="color:var(--text-muted)">${(n.message||'').slice(0,60)}…</small></td>
        <td>${n.channel}</td>
        <td><span class="badge badge-${sc}">${n.status}</span>${n.error ? `<br><small style="color:var(--status-danger)">${n.error}</small>` : ''}</td>
        <td>${n.attempts}/${n.max_attempts}</td>
        <td style="white-space:nowrap;">
          ${n.status === 'failed' || n.status === 'sent' ? `<button class="btn btn-sm btn-primary" onclick="window._resendNotif('${n.id}')">Resend</button>` : ''}
          ${n.status === 'pending' ? `<button class="btn btn-sm btn-danger" onclick="window._cancelNotif('${n.id}')">Cancel</button>` : ''}
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="8" style="text-align:center">No notifications.</td></tr>'}</tbody>
  </table>`;

  window._resendNotif = async (id) => {
    await supabase.from('notifications').update({ status: 'pending', attempts: 0, error: null }).eq('id', id);
    showToast('Queued for resend', 'success');
    loadQueue(); loadStats();
  };
  window._cancelNotif = async (id) => {
    await supabase.from('notifications').update({ status: 'cancelled' }).eq('id', id);
    showToast('Cancelled', 'info');
    loadQueue(); loadStats();
  };
}

async function flushQueue() {
  showToast('Flushing notification queue…', 'info');
  try {
    const result = await callBackend('/api/notify/flush', {});
    if (result?.error) {
      showToast('Flush failed: ' + result.error, 'error');
    } else {
      showToast(`Flushed: ${result.sent || 0} sent, ${result.failed || 0} failed`, 'success');
    }
  } catch (err) {
    showToast('Backend offline — cannot flush', 'error');
  }
  await loadQueue();
  await loadStats();
}

async function composeModal() {
  const { data: users } = await supabase.from('users').select('id, name, telegram_chat_id').eq('is_active', true);

  openModal('Compose Notification', `
    <form id="compose-form">
      <div class="form-group"><label class="form-label">Recipient</label>
        <select name="user_id" class="form-control">
          <option value="">All Users</option>
          ${users?.map(u => `<option value="${u.id}">${u.name} ${u.telegram_chat_id ? '✓' : '(no TG)'}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Type</label>
        <select name="type" class="form-control">
          <option value="general">General</option><option value="reminder">Reminder</option>
          <option value="expense">Expense</option><option value="payment">Payment</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Title</label>
        <input name="title" class="form-control" required placeholder="Notification title">
      </div>
      <div class="form-group"><label class="form-label">Message</label>
        <textarea name="message" class="form-control" rows="3" required placeholder="Message content…"></textarea>
      </div>
    </form>`,
    [{ label: 'Queue & Send', class: 'btn btn-primary', action: async () => {
      const fd = new FormData(document.getElementById('compose-form'));
      const userId = fd.get('user_id');
      const title = fd.get('title');
      const message = fd.get('message');
      const type = fd.get('type');

      if (!title || !message) { showToast('Title and message required', 'error'); return false; }

      if (userId) {
        await supabase.from('notifications').insert({ user_id: userId, type, title, message, channel: 'telegram', status: 'pending' });
      } else {
        const inserts = users.filter(u => u.telegram_chat_id).map(u => ({ user_id: u.id, type, title, message, channel: 'telegram', status: 'pending' }));
        if (inserts.length) await supabase.from('notifications').insert(inserts);
      }

      showToast('Notification queued! Click Flush to send.', 'success');
      closeModal(); loadQueue(); loadStats();
    }}]
  );
}
