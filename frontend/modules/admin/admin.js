/**
 * Admin Settings Module — Users, Audit Logs, Society Settings
 * frontend/modules/admin/admin.js
 * Only accessible to users with role = 'secretary'
 */
import { supabase, callBackend } from '../../lib/supabase.js';
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
      <button class="btn btn-primary" id="btn-add-user"><i class="fa-solid fa-user-plus"></i> Add User</button>
    </div>
    <div class="card" style="overflow:hidden;margin-top:1rem;">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
        <tbody>${users?.map(u=>`<tr>
          <td><strong>${u.name}</strong></td>
          <td>${u.email}</td>
          <td>${u.phone||'—'}</td>
          <td><span class="badge ${u.role === 'secretary' ? 'badge-primary' : 'badge-neutral'}">${u.role}</span></td>
          <td><span class="badge badge-${u.is_active?'success':'danger'}">${u.is_active?'Active':'Inactive'}</span></td>
          <td><small>${u.last_login?new Date(u.last_login).toLocaleDateString('en-IN'):'Never'}</small></td>
          <td>
            <button class="icon-btn" onclick="window._editUser('${u.id}')"><i class="fa-solid fa-pen"></i></button>
          </td>
        </tr>`).join('')||'<tr><td colspan="7" style="text-align:center">No users.</td></tr>'}</tbody>
      </table>
    </div>`;

  // Provide global access to the users array for the edit modal
  window._adminUsersList = users;

  window._editUser=async(id)=>{
    const user = window._adminUsersList.find(u => u.id === id);
    if (!user) return;

    openModal('Edit User', `
      <form id="user-edit-form">
        <div class="form-group"><label class="form-label">Name</label><input name="name" class="form-control" value="${user.name}" required></div>
        <div class="form-group"><label class="form-label">Email</label><input name="email" type="email" class="form-control" value="${user.email}" required></div>
        <div class="form-group"><label class="form-label">Phone</label><input name="phone" class="form-control" value="${user.phone||''}"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
          <div class="form-group"><label class="form-label">Role</label>
            <select name="role" class="form-control">
              <option value="resident" ${user.role === 'resident' ? 'selected' : ''}>resident</option>
              <option value="secretary" ${user.role === 'secretary' ? 'selected' : ''}>secretary</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Status</label>
            <select name="is_active" class="form-control">
              <option value="true" ${user.is_active?'selected':''}>Active</option>
              <option value="false" ${!user.is_active?'selected':''}>Inactive</option>
            </select>
          </div>
        </div>
      </form>
      <p style="font-size:.8rem;color:var(--text-muted);margin-top:1rem;">
        Note: The auth JWT role is updated automatically. Email changes require user verification if enabled in Supabase Auth.
      </p>`,
      [{ label:'Save', class:'btn btn-primary', action: async()=>{
        const fd=new FormData(document.getElementById('user-edit-form'));
        const obj=Object.fromEntries(fd);
        
        // Update user profile in database
        const {error}=await supabase.from('users').update({
          name: obj.name,
          email: obj.email,
          phone: obj.phone || null,
          role: obj.role,
          is_active: obj.is_active==='true',
          updated_at: new Date().toISOString()
        }).eq('id',id);
        
        if(error){showToast(error.message,'error');return false;}
        showToast('User updated!','success'); closeModal(); renderUsers(document.getElementById('admin-content'));
      }}]
    );
  };

  document.getElementById('btn-add-user')?.addEventListener('click',()=>{
    openModal('Add New User', `
      <div style="text-align: center; padding: 1rem;">
        <i class="fa-solid fa-server fa-3x" style="color: var(--text-muted); margin-bottom: 1rem;"></i>
        <h3 style="margin-bottom: 0.5rem;">Backend Server Disabled</h3>
        <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
          To add a new user, please do it manually via your Supabase Dashboard:
        </p>
        <ol style="text-align: left; color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6; margin-bottom: 1.5rem;">
          <li>Go to <strong>Authentication &rarr; Users</strong> and add the user.</li>
          <li>Copy their new <strong>User UID</strong>.</li>
          <li>Go to <strong>Table Editor &rarr; users</strong> and insert a new row with their UID and details.</li>
        </ol>
      </div>`, 
      [{ label:'Got it', class:'btn btn-primary', action: closeModal }]
    );
  });
}

/* ── AUDIT LOGS ── */
async function renderAuditLogs(container) {
  const {data:logs}=await supabase.from('audit_logs')
    .select('*,users(name)').order('created_at',{ascending:false}).limit(100);
  
  window._auditLogsData = logs;

  container.innerHTML=`
    <div class="page-toolbar" style="justify-content: flex-end; margin-bottom: 1rem;">
      <button class="btn btn-outline" id="btn-download-audit"><i class="fa-solid fa-download"></i> Download CSV</button>
    </div>
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

  document.getElementById('btn-download-audit')?.addEventListener('click', () => {
    if (!window._auditLogsData || !window._auditLogsData.length) return showToast('No data to download', 'warning');
    
    // Create CSV content
    const headers = ['Time', 'User', 'Action', 'Entity', 'IP Address'];
    const rows = window._auditLogsData.map(l => [
      new Date(l.created_at).toLocaleString('en-IN'),
      l.users?.name || l.user_id,
      l.action,
      l.entity || '',
      l.ip_address || ''
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    // Trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

/* ── SETTINGS ── */
async function renderSettings(container) {
  // Fetch settings
  const {data:rows}=await supabase.from('settings').select('*');
  const settings={};
  rows?.forEach(r=>{settings[r.key]=r.value;});

  // Fetch unit metadata
  const {data: units} = await supabase.from('units').select('status');
  const totalUnits = units?.length || 0;
  const occupiedUnits = units?.filter(u => u.status === 'Occupied').length || 0;
  const vacantUnits = totalUnits - occupiedUnits;

  container.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-bottom:1.5rem;">
      <div class="card stat-card" style="grid-column: span 1;">
        <div class="stat-value">${totalUnits}</div>
        <div class="stat-label">Total Units</div>
        <div class="stat-sub"><span style="color:var(--status-success)">${occupiedUnits} Occupied</span> · <span style="color:var(--status-warning)">${vacantUnits} Vacant</span></div>
      </div>
      <div class="card stat-card" style="grid-column: span 1;">
        <div class="stat-value" id="total-users-stat">...</div>
        <div class="stat-label">Total Users</div>
      </div>
    </div>
    
    <div class="card" style="padding:1.5rem;max-width:600px;">
      <h3 style="margin-bottom: 1.5rem; font-size: 1.2rem;">Society Details</h3>
      <form id="settings-form">
        <div class="form-group"><label class="form-label">Society Name</label>
          <input name="society_name" class="form-control" value="${settings.society_name||''}"></div>
        <div class="form-group"><label class="form-label">Society Address</label>
          <textarea name="society_address" class="form-control" rows="3">${settings.society_address||''}</textarea></div>
        <button type="submit" class="btn btn-primary" id="btn-save-settings">
          <i class="fa-solid fa-floppy-disk"></i> Save Settings
        </button>
      </form>
    </div>`;

  // Fetch users count asynchronously to not block initial render
  supabase.from('users').select('id', {count: 'exact', head: true}).then(({count}) => {
    const el = document.getElementById('total-users-stat');
    if(el) el.textContent = count || 0;
  });

  document.getElementById('settings-form').onsubmit=async(e)=>{
    e.preventDefault();
    const fd=new FormData(document.getElementById('settings-form'));
    for(const [key,value] of fd.entries()){
      await supabase.from('settings').upsert({key,value,updated_at:new Date().toISOString()},{onConflict:'key'});
    }
    
    // Update sidebar name dynamically if it exists
    const societyNameStr = fd.get('society_name');
    if (societyNameStr) {
      const sidebarTitle = document.getElementById('sidebar-society-name');
      if (sidebarTitle) sidebarTitle.textContent = societyNameStr;
    }
    
    showToast('Settings saved!','success');
  };
}
