/**
 * Admin Settings Module — Users, Audit Logs, Society Settings
 * frontend/modules/admin/admin.js
 * Only accessible to users with role = 'secretary'
 */
import { supabase } from '../../lib/supabase.js';
import { currentUser } from '../auth/auth.js';
import { showToast, openModal, closeModal } from '../../lib/ui.js';

export async function render(container) {
  container.innerHTML = `
    <div class="animate-fade-in">
      <div class="tab-bar">
        <button class="tab-btn active" data-tab="users">User Management</button>
        <button class="tab-btn" data-tab="audit">Audit Logs</button>
        <button class="tab-btn" data-tab="settings">Society Settings</button>
      </div>
      <div id="admin-content" style="margin-top:1rem;"></div>
    </div>`;
  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.addEventListener('click',()=>{
      document.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); loadAdminTab(b.dataset.tab);
    });
  });
  loadAdminTab('users');
}

function loadAdminTab(tab) {
  const c=document.getElementById('admin-content');
  if(tab==='users')    renderUsers(c);
  else if(tab==='audit')    renderAuditLogs(c);
  else if(tab==='settings') renderSettings(c);
}

/* ── USERS ── */
async function renderUsers(container) {
  const {data:users}=await supabase.from('users').select('*').order('role').order('name');
  container.innerHTML=`
    <div class="page-toolbar">
      <button class="btn btn-primary" id="btn-invite-user"><i class="fa-solid fa-user-plus"></i> Invite User</button>
    </div>
    <div class="card" style="overflow:hidden;margin-top:1rem;">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
        <tbody>${users?.map(u=>`<tr>
          <td><strong>${u.name}</strong></td>
          <td>${u.email}</td>
          <td>${u.phone||'—'}</td>
          <td><span class="badge">${u.role}</span></td>
          <td><span class="badge badge-${u.is_active?'success':'danger'}">${u.is_active?'Active':'Inactive'}</span></td>
          <td><small>${u.last_login?new Date(u.last_login).toLocaleDateString('en-IN'):'Never'}</small></td>
          <td>
            <button class="icon-btn" onclick="window._editUser('${u.id}','${u.role}',${u.is_active})">
              <i class="fa-solid fa-pen"></i>
            </button>
          </td>
        </tr>`).join('')||'<tr><td colspan="7" style="text-align:center">No users.</td></tr>'}</tbody>
      </table>
    </div>
    <div class="card" style="margin-top:1.5rem;padding:1rem;background:var(--bg-secondary);">
      <p style="margin:0;font-size:.85rem;color:var(--text-muted);">
        <i class="fa-solid fa-info-circle"></i>
        To invite new users: Go to <strong>Supabase Dashboard → Authentication → Users → Invite User</strong>.
        After they sign in, assign their role from the table above.
        The role in <strong>app_metadata</strong> is also set automatically via the trigger when you update it here.
      </p>
    </div>`;

  window._editUser=async(id,currentRoleVal,isActive)=>{
    openModal('Edit User', `
      <form id="user-edit-form">
        <div class="form-group"><label class="form-label">Role</label>
          <select name="role" class="form-control">
            ${['secretary','treasurer','manager','security','technician','resident'].map(r=>`<option ${r===currentRoleVal?'selected':''}>${r}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Status</label>
          <select name="is_active" class="form-control">
            <option value="true" ${isActive?'selected':''}>Active</option>
            <option value="false" ${!isActive?'selected':''}>Inactive</option>
          </select>
        </div>
      </form>
      <p style="font-size:.8rem;color:var(--text-muted);margin-top:1rem;">
        Note: Changing role here updates the users table. The auth JWT role (used by RLS) is updated via a Supabase database trigger.
      </p>`,
      [{ label:'Save', class:'btn btn-primary', action: async()=>{
        const fd=new FormData(document.getElementById('user-edit-form'));
        const obj=Object.fromEntries(fd);
        const {error}=await supabase.from('users').update({role:obj.role,is_active:obj.is_active==='true',updated_at:new Date().toISOString()}).eq('id',id);
        if(error){showToast(error.message,'error');return false;}
        showToast('User updated!','success'); closeModal(); renderUsers(document.getElementById('admin-content'));
      }}]
    );
  };

  document.getElementById('btn-invite-user')?.addEventListener('click',()=>{
    openModal('Invite New User', `
      <p>To create a new user account:</p>
      <ol style="padding-left:1.5rem;line-height:2;">
        <li>Go to <strong>Supabase Dashboard → Authentication → Users</strong></li>
        <li>Click <strong>Invite User</strong></li>
        <li>Enter their email — they will receive a login link</li>
        <li>Come back here and set their role</li>
      </ol>
      <a href="https://supabase.com/dashboard" target="_blank" class="btn btn-primary" style="margin-top:.5rem;">
        Open Supabase Dashboard <i class="fa-solid fa-arrow-up-right-from-square"></i>
      </a>`, []);
  });
}

/* ── AUDIT LOGS ── */
async function renderAuditLogs(container) {
  const {data:logs}=await supabase.from('audit_logs')
    .select('*,users(name)').order('created_at',{ascending:false}).limit(100);
  container.innerHTML=`
    <div class="card" style="overflow:hidden;">
      <table class="data-table">
        <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>IP</th></tr></thead>
        <tbody>${logs?.map(l=>`<tr>
          <td><small>${new Date(l.created_at).toLocaleString('en-IN')}</small></td>
          <td>${l.users?.name||l.user_id?.substring(0,8)||'—'}</td>
          <td><code style="font-size:.8rem;">${l.action}</code></td>
          <td>${l.entity||'—'}</td>
          <td><small>${l.ip_address||'—'}</small></td>
        </tr>`).join('')||'<tr><td colspan="5" style="text-align:center">No audit logs.</td></tr>'}</tbody>
      </table>
    </div>`;
}

/* ── SETTINGS ── */
async function renderSettings(container) {
  const {data:rows}=await supabase.from('settings').select('*');
  const settings={};
  rows?.forEach(r=>{settings[r.key]=r.value;});
  container.innerHTML=`
    <div class="card" style="padding:1.5rem;max-width:600px;">
      <form id="settings-form">
        <div class="form-group"><label class="form-label">Society Name</label>
          <input name="society_name" class="form-control" value="${settings.society_name||''}"></div>
        <div class="form-group"><label class="form-label">Society Address</label>
          <input name="society_address" class="form-control" value="${settings.society_address||''}"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
          <div class="form-group"><label class="form-label">Maintenance Rate (₹/sqft)</label>
            <input name="maintenance_rate_per_sqft" type="number" step="0.5" class="form-control" value="${settings.maintenance_rate_per_sqft||'3.5'}"></div>
          <div class="form-group"><label class="form-label">Penalty Rate (%)</label>
            <input name="penalty_rate_pct" type="number" step="0.1" class="form-control" value="${settings.penalty_rate_pct||'1.5'}"></div>
        </div>
        <div class="form-group"><label class="form-label">Grace Period (days before penalty)</label>
          <input name="grace_period_days" type="number" class="form-control" value="${settings.grace_period_days||'10'}"></div>
        <button type="submit" class="btn btn-primary" id="btn-save-settings">
          <i class="fa-solid fa-floppy-disk"></i> Save Settings
        </button>
      </form>
    </div>`;

  document.getElementById('settings-form').onsubmit=async(e)=>{
    e.preventDefault();
    const fd=new FormData(document.getElementById('settings-form'));
    for(const [key,value] of fd.entries()){
      await supabase.from('settings').upsert({key,value,updated_at:new Date().toISOString()},{onConflict:'key'});
    }
    showToast('Settings saved!','success');
  };
}
