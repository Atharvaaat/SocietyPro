/**
 * Units & Residents Module
 * frontend/modules/units/units.js
 */
import { supabase } from '../../lib/supabase.js';
import { hasRole } from '../auth/auth.js';
import { showToast, openModal, closeModal } from '../../lib/ui.js';

export async function render(container) {
  container.innerHTML = `
    <div class="animate-fade-in">
      <div class="page-toolbar">
        <input type="text" id="units-search" placeholder="Search unit…" class="form-control" style="max-width:280px;">
        <select id="units-status" class="form-control" style="width:auto;">
          <option value="">All Status</option>
          <option>Occupied</option><option>Vacant</option><option>Under Renovation</option>
        </select>
        ${hasRole('secretary','manager') ? `<button class="btn btn-primary" id="btn-add-unit"><i class="fa-solid fa-plus"></i> Add Unit</button>` : ''}
      </div>
      <div id="units-wrap" class="card" style="overflow:hidden;margin-top:1rem;"></div>
    </div>`;

  await loadUnits();
  document.getElementById('units-search')?.addEventListener('input', () => loadUnits());
  document.getElementById('units-status')?.addEventListener('change', () => loadUnits());
  document.getElementById('btn-add-unit')?.addEventListener('click', showAddUnitModal);
}

async function loadUnits() {
  const search = document.getElementById('units-search')?.value?.trim();
  const status = document.getElementById('units-status')?.value;
  let q = supabase.from('units').select('*, members(id,name,member_type,phone,is_active)').order('unit_number');
  if (status) q = q.eq('status', status);
  if (search) q = q.ilike('unit_number', `%${search}%`);
  const { data: units } = await q;
  const wrap = document.getElementById('units-wrap');
  if (!units?.length) { wrap.innerHTML = '<p style="padding:2rem;color:var(--text-muted);text-align:center;">No units found.</p>'; return; }
  wrap.innerHTML = `<table class="data-table">
    <thead><tr><th>Unit</th><th>Wing/Floor</th><th>Area</th><th>Owner</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${units.map(u => {
      const owner = u.members?.find(m => m.member_type === 'Owner' && m.is_active);
      const sc = { Occupied:'success', Vacant:'warning', 'Under Renovation':'danger' }[u.status];
      return `<tr>
        <td><strong>${u.unit_number}</strong></td>
        <td>${u.wing||'—'} / ${u.floor||'—'}</td>
        <td>${u.area_sqft ? u.area_sqft+' sqft' : '—'}</td>
        <td>${owner ? owner.name : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td><span class="badge badge-${sc}">${u.status}</span></td>
        <td>
          <button class="icon-btn" onclick="window._addMember('${u.id}')"><i class="fa-solid fa-user-plus"></i></button>
          ${hasRole('secretary','manager') ? `<button class="icon-btn" onclick="window._editUnit('${u.id}')"><i class="fa-solid fa-pen"></i></button>` : ''}
        </td>
      </tr>`;
    }).join('')}</tbody></table>`;
  window._editUnit  = (id) => editUnitModal(units.find(u=>u.id===id));
  window._addMember = (id) => addMemberModal(id);
}

async function showAddUnitModal() {
  openModal('Add Unit', `
    <form id="unit-form">
      <div class="form-group"><label class="form-label">Unit Number *</label><input name="unit_number" class="form-control" required placeholder="A-101"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Wing</label><input name="wing" class="form-control"></div>
        <div class="form-group"><label class="form-label">Floor</label><input name="floor" class="form-control"></div>
      </div>
      <div class="form-group"><label class="form-label">Area (sqft)</label><input name="area_sqft" type="number" class="form-control"></div>
      <div class="form-group"><label class="form-label">Status</label>
        <select name="status" class="form-control"><option>Vacant</option><option>Occupied</option><option>Under Renovation</option></select>
      </div>
    </form>`,
    [{ label:'Create', class:'btn btn-primary', action: async()=>{
      const fd=new FormData(document.getElementById('unit-form'));
      const {error}=await supabase.from('units').insert(Object.fromEntries(fd));
      if(error){showToast(error.message,'error');return false;}
      showToast('Unit created!','success'); closeModal(); loadUnits();
    }}]
  );
}

async function editUnitModal(unit) {
  openModal('Edit Unit', `
    <form id="unit-edit-form">
      <div class="form-group"><label class="form-label">Status</label>
        <select name="status" class="form-control">
          ${['Occupied','Vacant','Under Renovation'].map(s=>`<option ${unit.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Area (sqft)</label><input name="area_sqft" type="number" class="form-control" value="${unit.area_sqft||''}"></div>
    </form>`,
    [{ label:'Save', class:'btn btn-primary', action: async()=>{
      const fd=new FormData(document.getElementById('unit-edit-form'));
      const {error}=await supabase.from('units').update({...Object.fromEntries(fd),updated_at:new Date().toISOString()}).eq('id',unit.id);
      if(error){showToast(error.message,'error');return false;}
      showToast('Updated!','success'); closeModal(); loadUnits();
    }}]
  );
}

async function addMemberModal(unitId) {
  openModal('Add Member', `
    <form id="member-form">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Name *</label><input name="name" class="form-control" required></div>
        <div class="form-group"><label class="form-label">Type *</label>
          <select name="member_type" class="form-control"><option>Owner</option><option>Tenant</option></select>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Email</label><input name="email" type="email" class="form-control"></div>
        <div class="form-group"><label class="form-label">Phone</label><input name="phone" class="form-control"></div>
      </div>
      <div class="form-group"><label class="form-label">Move-in Date</label><input name="move_in_date" type="date" class="form-control"></div>
    </form>`,
    [{ label:'Add', class:'btn btn-primary', action: async()=>{
      const fd=new FormData(document.getElementById('member-form'));
      const obj={...Object.fromEntries(fd),unit_id:unitId};
      const {error}=await supabase.from('members').insert(obj);
      if(error){showToast(error.message,'error');return false;}
      await supabase.from('units').update({status:'Occupied',updated_at:new Date().toISOString()}).eq('id',unitId).eq('status','Vacant');
      showToast('Member added!','success'); closeModal(); loadUnits();
    }}]
  );
}
