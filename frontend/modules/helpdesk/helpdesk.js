/**
 * Helpdesk Module
 * frontend/modules/helpdesk/helpdesk.js
 *
 * - Users see only their own tickets
 * - Secretary sees all tickets
 * - Users can edit their own tickets (when Open/Reopened)
 * - Users can change status (Close/Reopen)
 * - Secretary/manager/technician can do full updates
 */
import { supabase, callBackend } from '../../lib/supabase.js';
import { hasRole, currentUser } from '../auth/auth.js';
import { showToast, openModal, closeModal } from '../../lib/ui.js';

export async function render(container) {
  container.innerHTML = `
    <div class="animate-fade-in">
      <div class="page-toolbar">
        <select id="ticket-status-filter" class="form-control" style="width:auto;">
          <option value="">All Status</option>
          <option>Open</option><option>Assigned</option><option>In-Progress</option>
          <option>Resolved</option><option>Closed</option><option>Reopened</option>
        </select>
        <select id="ticket-priority-filter" class="form-control" style="width:auto;">
          <option value="">All Priority</option>
          <option>Urgent</option><option>Normal</option><option>Low</option>
        </select>
        <div style="flex:1;"></div>
        <button class="btn btn-primary" id="btn-new-ticket"><i class="fa-solid fa-plus"></i> New Ticket</button>
      </div>
      <div id="tickets-wrap" class="card" style="overflow:hidden;margin-top:1rem;"></div>
    </div>`;

  await loadTickets();
  document.getElementById('ticket-status-filter')?.addEventListener('change', loadTickets);
  document.getElementById('ticket-priority-filter')?.addEventListener('change', loadTickets);
  document.getElementById('btn-new-ticket')?.addEventListener('click', newTicketModal);
}

async function loadTickets() {
  const status   = document.getElementById('ticket-status-filter')?.value;
  const priority = document.getElementById('ticket-priority-filter')?.value;
  let q = supabase.from('tickets')
    .select('*, units(unit_number), users!raised_by(name), assignee:users!assigned_to(name)')
    .order('created_at', { ascending: false }).limit(50);

  // Non-secretary users only see their own tickets
  if (!hasRole('secretary')) {
    q = q.eq('raised_by', currentUser.id);
  }

  if (status)   q = q.eq('status', status);
  if (priority) q = q.eq('priority', priority);
  const { data: tickets } = await q;
  const wrap = document.getElementById('tickets-wrap');
  wrap.innerHTML = `<table class="data-table">
    <thead><tr><th>Ticket #</th><th>Unit</th><th>Category</th><th>Priority</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
    <tbody>${tickets?.map(t => {
      const pc = { Urgent:'danger', Normal:'warning', Low:'secondary' }[t.priority] || '';
      const sc = { Open:'warning', 'In-Progress':'info', Resolved:'success', Closed:'secondary', Assigned:'info', Reopened:'warning' }[t.status] || '';
      const isOwner = t.raised_by === currentUser.id;
      const isAdmin = hasRole('secretary');
      const canEdit = isOwner && ['Open','Reopened'].includes(t.status);
      const canUpdate = isAdmin || isOwner;
      return `<tr>
        <td><strong>${t.ticket_number}</strong></td>
        <td>${t.units?.unit_number || '—'}</td>
        <td>${t.category}</td>
        <td><span class="badge badge-${pc}">${t.priority}</span></td>
        <td><span class="badge badge-${sc}">${t.status}</span></td>
        <td><small>${new Date(t.created_at).toLocaleDateString('en-IN')}</small></td>
        <td style="white-space:nowrap;">
          <button class="icon-btn" onclick="window._viewTicket('${t.id}')" title="View"><i class="fa-solid fa-eye"></i></button>
          ${canEdit ? `<button class="icon-btn" onclick="window._editTicket('${t.id}')" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>` : ''}
          ${canUpdate ? `<button class="icon-btn" onclick="window._updateTicket('${t.id}','${isAdmin}','${isOwner}')" title="Update Status"><i class="fa-solid fa-arrows-rotate"></i></button>` : ''}
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" style="text-align:center">No tickets.</td></tr>'}</tbody>
  </table>`;
  window._viewTicket   = (id) => viewTicketModal(id);
  window._editTicket   = (id) => editTicketModal(id);
  window._updateTicket = (id, isAdmin, isOwner) => updateTicketModal(id, isAdmin === 'true', isOwner === 'true');
}

async function newTicketModal() {
  const { data: units } = await supabase.from('units').select('id,unit_number').order('unit_number');
  openModal('Create Ticket', `
    <form id="ticket-form">
      <div class="form-group"><label class="form-label">Unit *</label>
        <select name="unit_id" class="form-control" required>
          <option value="">Select unit…</option>
          ${units?.map(u=>`<option value="${u.id}">${u.unit_number}</option>`).join('')}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Category *</label>
          <select name="category" class="form-control">
            <option>Plumbing</option><option>Electrical</option><option>Lift</option>
            <option>Parking</option><option>Security</option><option>Housekeeping</option><option>Other</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Priority</label>
          <select name="priority" class="form-control"><option>Normal</option><option>Urgent</option><option>Low</option></select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Description *</label>
        <textarea name="description" class="form-control" rows="3" required></textarea>
      </div>
    </form>`,
    [{ label:'Submit', class:'btn btn-primary', action: async()=>{
      const fd=new FormData(document.getElementById('ticket-form'));
      const obj=Object.fromEntries(fd);
      const tktNum=`TKT-${String(Date.now()).slice(-6)}`;
      const {data: newTicket, error}=await supabase.from('tickets').insert({...obj,ticket_number:tktNum,status:'Open',raised_by:currentUser.id}).select().single();
      if(error){showToast(error.message,'error');return false;}
      // Add timeline entry
      await supabase.from('ticket_updates').insert({ticket_id:newTicket.id,updated_by:currentUser.id,status:'Open',note:'Ticket raised'});
      // Queue notification for admin
      try {
        await supabase.from('notifications').insert({
          type:'ticket', title:`New Ticket ${tktNum}`,
          message:`New ${obj.priority} ticket raised: ${obj.category} — ${obj.description?.slice(0,100)}`,
          channel:'telegram', status:'pending',
          metadata:{ticket_id:newTicket.id}
        });
      } catch(e){}
      showToast('Ticket created!','success'); closeModal(); loadTickets();
    }}]
  );
}

async function viewTicketModal(id) {
  const [{data:ticket},{data:updates}]=await Promise.all([
    supabase.from('tickets').select('*,units(unit_number),users!raised_by(name),assignee:users!assigned_to(name)').eq('id',id).single(),
    supabase.from('ticket_updates').select('*,users(name)').eq('ticket_id',id).order('created_at')
  ]);
  openModal(`Ticket ${ticket.ticket_number}`, `
    <div style="margin-bottom:1rem;">
      <strong>${ticket.category}</strong> — Unit ${ticket.units?.unit_number}<br>
      <small style="color:var(--text-muted)">Raised by: ${ticket.users?.name||'Unknown'} · ${new Date(ticket.created_at).toLocaleDateString('en-IN')}</small>
      ${ticket.assignee?.name ? `<br><small style="color:var(--text-muted)">Assigned to: ${ticket.assignee.name}</small>` : ''}
    </div>
    <p style="background:var(--bg-secondary);padding:1rem;border-radius:8px;margin-bottom:1.5rem;">${ticket.description}</p>
    <h4>Timeline</h4>
    <div style="border-left:2px solid var(--border);padding-left:1rem;margin-top:.75rem;">
      ${updates?.map(u=>`
        <div style="margin-bottom:.75rem;">
          <strong>${u.users?.name||'System'}</strong> — <span class="badge">${u.status}</span>
          <div style="font-size:.85rem;color:var(--text-muted)">${new Date(u.created_at).toLocaleString('en-IN')}</div>
          ${u.note?`<p style="margin:.25rem 0 0;font-size:.9rem">${u.note}</p>`:''}
        </div>`).join('')||'<p style="color:var(--text-muted)">No updates yet.</p>'}
    </div>`, []);
}

async function editTicketModal(id) {
  const {data:ticket} = await supabase.from('tickets').select('*').eq('id',id).single();
  if (!ticket) { showToast('Ticket not found','error'); return; }

  const { data: units } = await supabase.from('units').select('id,unit_number').order('unit_number');
  openModal('Edit Ticket', `
    <form id="edit-ticket-form">
      <div class="form-group"><label class="form-label">Unit</label>
        <select name="unit_id" class="form-control">
          ${units?.map(u=>`<option value="${u.id}" ${u.id===ticket.unit_id?'selected':''}>${u.unit_number}</option>`).join('')}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Category</label>
          <select name="category" class="form-control">
            ${['Plumbing','Electrical','Lift','Parking','Security','Housekeeping','Other'].map(c=>`<option ${c===ticket.category?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Priority</label>
          <select name="priority" class="form-control">
            ${['Normal','Urgent','Low'].map(p=>`<option ${p===ticket.priority?'selected':''}>${p}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Description</label>
        <textarea name="description" class="form-control" rows="3">${ticket.description}</textarea>
      </div>
    </form>`,
    [{ label:'Save Changes', class:'btn btn-primary', action: async()=>{
      const fd=new FormData(document.getElementById('edit-ticket-form'));
      const obj=Object.fromEntries(fd);
      obj.updated_at = new Date().toISOString();
      const {error}=await supabase.from('tickets').update(obj).eq('id',id);
      if(error){showToast(error.message,'error');return false;}
      await supabase.from('ticket_updates').insert({ticket_id:id,updated_by:currentUser.id,status:ticket.status,note:'Ticket details edited'});
      showToast('Ticket updated!','success'); closeModal(); loadTickets();
    }}]
  );
}

async function updateTicketModal(id, isAdmin, isOwner) {
  // Admin gets all status options + assign; user gets limited options
  let statusOptions = '';
  let assignSection = '';

  if (isAdmin) {
    statusOptions = ['Open','Assigned','In-Progress','Resolved','Closed','Reopened'].map(s=>
      `<option>${s}</option>`).join('');

    const {data:users}=await supabase.from('users').select('id,name').eq('is_active',true);
    assignSection = `
      <div class="form-group"><label class="form-label">Assign To</label>
        <select name="assigned_to" class="form-control">
          <option value="">Unassigned</option>
          ${users?.map(u=>`<option value="${u.id}">${u.name}</option>`).join('')}
        </select>
      </div>`;
  } else {
    // Regular user — can only Close or Reopen
    statusOptions = ['Closed','Reopened'].map(s=>`<option>${s}</option>`).join('');
  }

  openModal('Update Ticket Status', `
    <form id="ticket-update-form">
      <div class="form-group"><label class="form-label">New Status</label>
        <select name="status" class="form-control">${statusOptions}</select>
      </div>
      ${assignSection}
      <div class="form-group"><label class="form-label">Note</label>
        <textarea name="note" class="form-control" rows="2" placeholder="Add a note…"></textarea>
      </div>
    </form>`,
    [{ label:'Update', class:'btn btn-primary', action: async()=>{
      const fd=new FormData(document.getElementById('ticket-update-form'));
      const {status,assigned_to,note}=Object.fromEntries(fd);
      const upd={status,updated_at:new Date().toISOString()};
      if(assigned_to) upd.assigned_to=assigned_to;
      if(status==='Resolved') upd.resolved_at=new Date().toISOString();
      if(status==='Closed') upd.closed_at=new Date().toISOString();
      const {error}=await supabase.from('tickets').update(upd).eq('id',id);
      if(error){showToast(error.message,'error');return false;}
      await supabase.from('ticket_updates').insert({ticket_id:id,updated_by:currentUser.id,status,note:note||null});
      // Notify via backend if admin updates
      try{
        const {data:t}=await supabase.from('tickets').select('users!raised_by(email,name,phone,telegram_chat_id),ticket_number').eq('id',id).single();
        if(t?.users?.email) await callBackend('/api/notify/email',{to:t.users.email,subject:`Ticket ${t.ticket_number} Updated`,html:`<p>Status changed to <strong>${status}</strong>. ${note||''}</p>`});
        // Queue telegram notification
        if(t?.users?.telegram_chat_id) {
          await supabase.from('notifications').insert({
            user_id: t.users?.id, type:'ticket', title:`Ticket ${t.ticket_number} Updated`,
            message:`Status: ${status}${note ? '. '+note : ''}`,
            channel:'telegram', status:'pending',
            metadata:{ticket_id:id}
          });
        }
      }catch{}
      showToast('Ticket updated!','success'); closeModal(); loadTickets();
    }}]
  );
}
