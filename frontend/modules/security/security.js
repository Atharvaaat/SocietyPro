/**
 * Security Module — Visitors, Staff Attendance, SOS
 * frontend/modules/security/security.js
 */
import { supabase, callBackend } from '../../lib/supabase.js';
import { hasRole, currentUser } from '../auth/auth.js';
import { showToast, openModal, closeModal } from '../../lib/ui.js';

export async function render(container) {
  container.innerHTML = `
    <div class="animate-fade-in">
      <div class="tab-bar">
        <button class="tab-btn active" data-tab="visitors">Visitors</button>
        <button class="tab-btn" data-tab="attendance">Staff Attendance</button>
        <button class="tab-btn" data-tab="sos">SOS Alerts</button>
      </div>
      <div id="sec-content" style="margin-top:1rem;"></div>
    </div>`;
  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.addEventListener('click',()=>{
      document.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); loadSecTab(b.dataset.tab);
    });
  });
  loadSecTab('visitors');
}

function loadSecTab(tab) {
  const c=document.getElementById('sec-content');
  if(tab==='visitors')   renderVisitors(c);
  else if(tab==='attendance') renderAttendance(c);
  else if(tab==='sos')   renderSOS(c);
}

/* ── VISITORS ── */
async function renderVisitors(container) {
  const today=new Date().toISOString().split('T')[0];
  const {data:visitors}=await supabase.from('visitors')
    .select('*,units!host_unit_id(unit_number),users!logged_by(name)')
    .gte('check_in',today).order('check_in',{ascending:false});

  container.innerHTML=`
    <div class="page-toolbar">
      <button class="btn btn-primary" id="btn-checkin-visitor"><i class="fa-solid fa-plus"></i> Check In Visitor</button>
      <button class="btn btn-outline" id="btn-pre-approve"><i class="fa-solid fa-qrcode"></i> Pre-Approve</button>
    </div>
    <div class="card" style="overflow:hidden;margin-top:1rem;">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Purpose</th><th>Host Unit</th><th>Check In</th><th>Check Out</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>${visitors?.map(v=>`<tr>
          <td><strong>${v.name}</strong><br><small>${v.phone||'—'}</small></td>
          <td>${v.purpose}</td>
          <td>${v.units?.unit_number||'—'}</td>
          <td>${new Date(v.check_in).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</td>
          <td>${v.check_out?new Date(v.check_out).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'Still inside'}</td>
          <td><span class="badge badge-${v.status==='Checked In'?'success':v.status==='Checked Out'?'secondary':'info'}">${v.status}</span></td>
          <td>${v.status==='Checked In'?`<button class="btn btn-sm btn-outline" onclick="window._checkout('${v.id}')">Check Out</button>`:''}
          </td>
        </tr>`).join('')||'<tr><td colspan="7" style="text-align:center">No visitors today.</td></tr>'}</tbody>
      </table>
    </div>`;

  document.getElementById('btn-checkin-visitor')?.addEventListener('click', checkInVisitorModal);
  document.getElementById('btn-pre-approve')?.addEventListener('click', preApproveModal);
  window._checkout=async(id)=>{
    await supabase.from('visitors').update({check_out:new Date().toISOString(),status:'Checked Out'}).eq('id',id);
    showToast('Checked out','success'); renderVisitors(container);
  };
}

async function checkInVisitorModal() {
  const {data:units}=await supabase.from('units').select('id,unit_number').eq('status','Occupied').order('unit_number');
  openModal('Check In Visitor', `
    <form id="visitor-form">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Name *</label><input name="name" class="form-control" required></div>
        <div class="form-group"><label class="form-label">Phone</label><input name="phone" class="form-control"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Purpose *</label>
          <select name="purpose" class="form-control" required>
            <option>Guest</option><option>Delivery</option><option>Cab/Driver</option><option>Repair Work</option><option>Other</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Host Unit *</label>
          <select name="host_unit_id" class="form-control" required>
            <option value="">Select…</option>
            ${units?.map(u=>`<option value="${u.id}">${u.unit_number}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Vehicle No.</label><input name="vehicle_no" class="form-control"></div>
      <div class="form-group"><label class="form-label">ID Proof</label><input name="id_proof" class="form-control" placeholder="Aadhar / Driving License / PAN"></div>
    </form>`,
    [{ label:'Check In', class:'btn btn-primary', action: async()=>{
      const fd=new FormData(document.getElementById('visitor-form'));
      const obj={...Object.fromEntries(fd),logged_by:currentUser.id,status:'Checked In'};
      const {error}=await supabase.from('visitors').insert(obj);
      if(error){showToast(error.message,'error');return false;}
      // Notify host via SMS
      const {data:member}=await supabase.from('members').select('phone,name').eq('unit_id',obj.host_unit_id).eq('is_active',true).limit(1).single();
      if(member?.phone) try{await callBackend('/api/notify/sms',{phone:member.phone,message:`Visitor: ${obj.name} (${obj.purpose}) has checked in at your unit. - SocietyPro`});}catch{}
      showToast('Visitor checked in!','success'); closeModal(); renderVisitors(document.getElementById('sec-content'));
    }}]
  );
}

async function preApproveModal() {
  const {data:units}=await supabase.from('units').select('id,unit_number').eq('status','Occupied').order('unit_number');
  openModal('Pre-Approve Visitor', `
    <form id="preapprove-form">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Visitor Name *</label><input name="name" class="form-control" required></div>
        <div class="form-group"><label class="form-label">Visitor Phone</label><input name="phone" class="form-control"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Purpose *</label>
          <select name="purpose" class="form-control"><option>Guest</option><option>Delivery</option><option>Repair Work</option><option>Other</option></select>
        </div>
        <div class="form-group"><label class="form-label">Your Unit *</label>
          <select name="host_unit_id" class="form-control" required>
            <option value="">Select…</option>
            ${units?.map(u=>`<option value="${u.id}">${u.unit_number}</option>`).join('')}
          </select>
        </div>
      </div>
    </form>`,
    [{ label:'Generate Pass', class:'btn btn-primary', action: async()=>{
      const fd=new FormData(document.getElementById('preapprove-form'));
      const obj=Object.fromEntries(fd);
      const qrToken=Math.random().toString(36).substring(2,18).toUpperCase();
      const {error}=await supabase.from('visitors').insert({...obj,qr_token:qrToken,status:'Pre-Approved'});
      if(error){showToast(error.message,'error');return false;}
      showToast(`Pass code: ${qrToken} — Share with your visitor`,'success');
      closeModal(); renderVisitors(document.getElementById('sec-content'));
    }}]
  );
}

/* ── STAFF ATTENDANCE ── */
async function renderAttendance(container) {
  const today=new Date().toISOString().split('T')[0];
  const {data:records}=await supabase.from('staff_attendance').select('*').eq('date',today).order('staff_name');
  container.innerHTML=`
    <div class="page-toolbar">
      <button class="btn btn-primary" id="btn-mark-attendance"><i class="fa-solid fa-plus"></i> Mark Attendance</button>
    </div>
    <div class="card" style="overflow:hidden;margin-top:1rem;">
      <div style="padding:1rem;border-bottom:1px solid var(--border);font-weight:600;">Attendance for ${new Date(today).toLocaleDateString('en-IN')}</div>
      <table class="data-table">
        <thead><tr><th>Staff</th><th>Role</th><th>Check In</th><th>Check Out</th><th>Status</th></tr></thead>
        <tbody>${records?.map(r=>`<tr>
          <td>${r.staff_name}</td>
          <td>${r.role||'—'}</td>
          <td>${r.check_in||'—'}</td>
          <td>${r.check_out||'—'}</td>
          <td><span class="badge badge-${r.status==='Present'?'success':r.status==='Absent'?'danger':'warning'}">${r.status}</span></td>
        </tr>`).join('')||'<tr><td colspan="5" style="text-align:center">No attendance records today.</td></tr>'}</tbody>
      </table>
    </div>`;
  document.getElementById('btn-mark-attendance')?.addEventListener('click', markAttendanceModal);
}

async function markAttendanceModal() {
  openModal('Mark Staff Attendance', `
    <form id="attendance-form">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Staff Name *</label><input name="staff_name" class="form-control" required></div>
        <div class="form-group"><label class="form-label">Role *</label>
          <select name="role" class="form-control"><option>Security Guard</option><option>Housekeeping</option><option>Gardener</option><option>Lift Operator</option><option>Other</option></select>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Check In</label><input name="check_in" type="time" class="form-control"></div>
        <div class="form-group"><label class="form-label">Check Out</label><input name="check_out" type="time" class="form-control"></div>
      </div>
      <div class="form-group"><label class="form-label">Status</label>
        <select name="status" class="form-control"><option>Present</option><option>Absent</option><option>Half Day</option></select>
      </div>
    </form>`,
    [{ label:'Save', class:'btn btn-primary', action: async()=>{
      const fd=new FormData(document.getElementById('attendance-form'));
      const {error}=await supabase.from('staff_attendance').insert({...Object.fromEntries(fd),date:new Date().toISOString().split('T')[0]});
      if(error){showToast(error.message,'error');return false;}
      showToast('Attendance recorded!','success'); closeModal(); renderAttendance(document.getElementById('sec-content'));
    }}]
  );
}

/* ── SOS ALERTS ── */
async function renderSOS(container) {
  const {data:alerts}=await supabase.from('sos_alerts')
    .select('*,units(unit_number),members(name)').order('created_at',{ascending:false}).limit(30);
  container.innerHTML=`
    <div class="page-toolbar">
      <button class="btn btn-danger" id="btn-sos" style="font-weight:700;letter-spacing:.05em;">
        <i class="fa-solid fa-triangle-exclamation"></i> TRIGGER SOS ALERT
      </button>
    </div>
    <div class="card" style="overflow:hidden;margin-top:1rem;">
      <table class="data-table">
        <thead><tr><th>Unit</th><th>Member</th><th>Message</th><th>Time</th><th>Type</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>${alerts?.map(a=>`<tr>
          <td>${a.units?.unit_number||'—'}</td>
          <td>${a.members?.name||'—'}</td>
          <td>${a.message}</td>
          <td>${new Date(a.created_at).toLocaleString('en-IN')}</td>
          <td><span class="badge badge-${a.is_drill?'secondary':'danger'}">${a.is_drill?'DRILL':'REAL'}</span></td>
          <td><span class="badge badge-${a.resolved?'success':'danger'}">${a.resolved?'Resolved':'Active'}</span></td>
          <td>${!a.resolved&&hasRole('secretary','manager','security')?`<button class="btn btn-sm btn-success" onclick="window._resolveAlert('${a.id}')">Resolve</button>`:''}
          </td>
        </tr>`).join('')||'<tr><td colspan="7" style="text-align:center">No alerts.</td></tr>'}</tbody>
      </table>
    </div>`;

  document.getElementById('btn-sos')?.addEventListener('click', triggerSOSModal);
  window._resolveAlert=async(id)=>{
    await supabase.from('sos_alerts').update({resolved:true,resolved_at:new Date().toISOString()}).eq('id',id);
    showToast('Alert resolved','success'); renderSOS(container);
  };
}

async function triggerSOSModal() {
  const {data:units}=await supabase.from('units').select('id,unit_number').order('unit_number');
  openModal('🚨 Trigger SOS Alert', `
    <div style="background:#fdeaea;border-radius:8px;padding:1rem;margin-bottom:1rem;color:#b83232;font-weight:600;">
      This will immediately alert security and committee members via SMS.
    </div>
    <form id="sos-form">
      <div class="form-group"><label class="form-label">Your Unit *</label>
        <select name="unit_id" class="form-control" required>
          <option value="">Select…</option>
          ${units?.map(u=>`<option value="${u.id}">${u.unit_number}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Message</label>
        <input name="message" class="form-control" value="Panic/Emergency alert" placeholder="Describe the emergency">
      </div>
      <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;">
        <input type="checkbox" name="is_drill" value="1"> This is a drill (no real emergency)
      </label>
    </form>`,
    [{ label:'🚨 Send SOS', class:'btn btn-danger', action: async()=>{
      const fd=new FormData(document.getElementById('sos-form'));
      const obj=Object.fromEntries(fd);
      const {data,error}=await supabase.from('sos_alerts').insert({unit_id:obj.unit_id,message:obj.message||'Panic/Emergency alert',is_drill:obj.is_drill==='1'}).select().single();
      if(error){showToast(error.message,'error');return false;}
      // Notify secretary + security via SMS
      const {data:staff}=await supabase.from('users').select('phone').in('role',['secretary','security','manager']).eq('is_active',true).not('phone','is',null);
      const {data:unit}=await supabase.from('units').select('unit_number').eq('id',obj.unit_id).single();
      for(const s of staff||[]){
        try{await callBackend('/api/notify/sms',{phone:s.phone,message:`🚨 SOS ALERT${obj.is_drill==='1'?' [DRILL]':''} from Unit ${unit?.unit_number}: ${obj.message} - SocietyPro`});}catch{}
      }
      showToast(obj.is_drill==='1'?'Drill SOS triggered':'🚨 SOS Alert sent!','success');
      closeModal(); renderSOS(document.getElementById('sec-content'));
    }}]
  );
}
