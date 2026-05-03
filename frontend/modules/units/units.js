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
        ${hasRole('secretary') ? `<button class="btn btn-primary" id="btn-add-unit"><i class="fa-solid fa-plus"></i> Add Unit</button>` : ''}
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
  let q = supabase.from('units').select('*, members(id,user_id,member_type,is_active,users(id,name,email,phone))').order('unit_number');
  if (status) q = q.eq('status', status);
  if (search) q = q.ilike('unit_number', `%${search}%`);
  const { data: units, error } = await q;
  if (error) { console.error('loadUnits error:', error); }
  const wrap = document.getElementById('units-wrap');
  if (!units?.length) { wrap.innerHTML = '<p style="padding:2rem;color:var(--text-muted);text-align:center;">No units found.</p>'; return; }
  wrap.innerHTML = `<table class="data-table">
    <thead><tr><th>Unit</th><th>Wing/Floor</th><th>Area</th><th>Owner</th><th>Members</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${units.map(u => {
      const owner = u.members?.find(m => m.member_type === 'Owner' && m.is_active);
      const residents = u.members?.filter(m => m.member_type === 'Resident' && m.is_active) || [];
      const sc = { Occupied:'success', Vacant:'warning', 'Under Renovation':'danger' }[u.status];
      return `<tr>
        <td><strong>${u.unit_number}</strong>${u.description ? `<br><small style="color:var(--text-muted)">${u.description.substring(0,40)}${u.description.length>40?'…':''}</small>` : ''}</td>
        <td>${u.wing||'—'} / ${u.floor||'—'}</td>
        <td>${u.area_sqft ? u.area_sqft+' sqft' : '—'}</td>
        <td>${owner?.users?.name || '<span style="color:var(--text-muted)">—</span>'}</td>
        <td><span class="badge badge-neutral">${residents.length} resident${residents.length!==1?'s':''}</span></td>
        <td><span class="badge badge-${sc}">${u.status}</span></td>
        <td>
          ${hasRole('secretary') ? `
            <button class="icon-btn" title="Edit Unit" onclick="window._editUnit('${u.id}')"><i class="fa-solid fa-pen"></i></button>
            <button class="icon-btn" title="Manage Members" onclick="window._manageMembers('${u.id}')"><i class="fa-solid fa-users"></i></button>
          ` : ''}
        </td>
      </tr>`;
    }).join('')}</tbody></table>`;
  window._editUnit = (id) => editUnitModal(units.find(u=>u.id===id));
  window._manageMembers = (id) => manageMembersModal(units.find(u=>u.id===id));
}

/* ── Add Unit Modal with member assignment ── */
async function showAddUnitModal() {
  // Fetch existing users for member dropdown
  const { data: allUsers } = await supabase.from('users').select('id,name,email,phone').eq('is_active', true).order('name');

  openModal('Add Unit', `
    <form id="unit-form">
      <div class="form-group"><label class="form-label">Unit Number *</label><input name="unit_number" class="form-control" required placeholder="A-101"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Wing</label><input name="wing" class="form-control" placeholder="A"></div>
        <div class="form-group"><label class="form-label">Floor</label><input name="floor" class="form-control" placeholder="1st"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Area (sqft)</label><input name="area_sqft" type="number" step="0.01" class="form-control"></div>
        <div class="form-group"><label class="form-label">Status</label>
          <select name="status" class="form-control"><option>Vacant</option><option>Occupied</option><option>Under Renovation</option></select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Description</label><textarea name="description" class="form-control" rows="2" placeholder="Optional description…"></textarea></div>

      <hr style="border-color:var(--bg-panel-border);margin:1.25rem 0;">
      <h4 style="font-size:.95rem;margin-bottom:.75rem;color:var(--text-secondary);">
        <i class="fa-solid fa-users"></i> Assign Members <small style="color:var(--text-muted)">(optional)</small>
      </h4>

      <!-- Owner -->
      <div class="form-group">
        <label class="form-label">Owner</label>
        <select id="unit-owner-select" class="form-control">
          <option value="">— No owner —</option>
          ${allUsers?.map(u => `<option value="${u.id}">${u.name} (${u.email})</option>`).join('')}
        </select>
      </div>

      <!-- Residents -->
      <div class="form-group">
        <label class="form-label">Residents</label>
        <select id="unit-resident-select" class="form-control">
          <option value="">— Add a resident —</option>
          ${allUsers?.map(u => `<option value="${u.id}">${u.name} (${u.email})</option>`).join('')}
        </select>
        <div id="selected-residents" style="display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.5rem;"></div>
      </div>
    </form>`,
    [{ label:'Create', class:'btn btn-primary', action: async () => {
      const fd = new FormData(document.getElementById('unit-form'));
      const obj = {};
      for (const [k,v] of fd.entries()) {
        // Convert empty strings to null for optional fields
        if (['wing','floor','area_sqft','description'].includes(k)) {
          obj[k] = v.trim() === '' ? null : v.trim();
        } else {
          obj[k] = v.trim();
        }
      }
      // Convert area_sqft to number if present
      if (obj.area_sqft) obj.area_sqft = parseFloat(obj.area_sqft);

      console.log('[Units] Creating unit:', obj);
      const { data: newUnit, error } = await supabase.from('units').insert(obj).select().single();
      if (error) { showToast(error.message, 'error'); console.error('[Units] Insert error:', error); return false; }

      // Add members if selected
      const ownerId = document.getElementById('unit-owner-select')?.value;
      const residentChips = document.querySelectorAll('#selected-residents .member-chip');
      const memberInserts = [];

      if (ownerId) {
        memberInserts.push({ unit_id: newUnit.id, user_id: ownerId, member_type: 'Owner', is_active: true });
      }
      residentChips.forEach(chip => {
        const uid = chip.dataset.userId;
        if (uid && uid !== ownerId) {
          memberInserts.push({ unit_id: newUnit.id, user_id: uid, member_type: 'Resident', is_active: true });
        }
      });

      if (memberInserts.length) {
        const { error: memErr } = await supabase.from('members').insert(memberInserts);
        if (memErr) { showToast('Unit created but member assignment failed: ' + memErr.message, 'warning'); }
        // If members added, mark as Occupied
        if (newUnit.status === 'Vacant') {
          await supabase.from('units').update({ status: 'Occupied', updated_at: new Date().toISOString() }).eq('id', newUnit.id);
        }
      }

      showToast('Unit created!', 'success'); closeModal(); loadUnits();
    }}]
  );

  // Wire up resident multi-select
  _wireResidentSelect();
}

/* ── Edit Unit Modal ── */
async function editUnitModal(unit) {
  openModal('Edit Unit — ' + unit.unit_number, `
    <form id="unit-edit-form">
      <div class="form-group"><label class="form-label">Unit Number</label><input name="unit_number" class="form-control" value="${unit.unit_number}" readonly style="opacity:.6;cursor:not-allowed;"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Wing</label><input name="wing" class="form-control" value="${unit.wing||''}"></div>
        <div class="form-group"><label class="form-label">Floor</label><input name="floor" class="form-control" value="${unit.floor||''}"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Area (sqft)</label><input name="area_sqft" type="number" step="0.01" class="form-control" value="${unit.area_sqft||''}"></div>
        <div class="form-group"><label class="form-label">Status</label>
          <select name="status" class="form-control">
            ${['Occupied','Vacant','Under Renovation'].map(s=>`<option ${unit.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Description</label><textarea name="description" class="form-control" rows="2">${unit.description||''}</textarea></div>
    </form>`,
    [{ label:'Save', class:'btn btn-primary', action: async () => {
      const fd = new FormData(document.getElementById('unit-edit-form'));
      const obj = { updated_at: new Date().toISOString() };
      for (const [k,v] of fd.entries()) {
        if (k === 'unit_number') continue; // don't update PK
        obj[k] = ['wing','floor','area_sqft','description'].includes(k) && v.trim() === '' ? null : v.trim();
      }
      if (obj.area_sqft) obj.area_sqft = parseFloat(obj.area_sqft);
      const { error } = await supabase.from('units').update(obj).eq('id', unit.id);
      if (error) { showToast(error.message, 'error'); return false; }
      showToast('Updated!', 'success'); closeModal(); loadUnits();
    }}]
  );
}

/* ── Manage Members Modal ── */
async function manageMembersModal(unit) {
  const { data: allUsers } = await supabase.from('users').select('id,name,email,phone').eq('is_active', true).order('name');
  const currentMembers = unit.members?.filter(m => m.is_active) || [];
  const owner = currentMembers.find(m => m.member_type === 'Owner');
  const residents = currentMembers.filter(m => m.member_type === 'Resident');

  openModal(`Members — Unit ${unit.unit_number}`, `
    <div id="members-panel">
      <!-- Current Members -->
      <div style="margin-bottom:1.25rem;">
        <h4 style="font-size:.9rem;color:var(--text-secondary);margin-bottom:.5rem;">Current Members</h4>
        ${currentMembers.length ? `
          <table class="data-table" style="font-size:.85rem;">
            <thead><tr><th>Name</th><th>Type</th><th>Actions</th></tr></thead>
            <tbody>${currentMembers.map(m => `<tr>
              <td>${m.users?.name || 'Unknown'}<br><small style="color:var(--text-muted)">${m.users?.email||''}</small></td>
              <td><span class="badge ${m.member_type==='Owner'?'badge-primary':'badge-neutral'}">${m.member_type}</span></td>
              <td><button class="btn btn-sm btn-danger" onclick="window._removeMember('${m.id}')"><i class="fa-solid fa-trash"></i></button></td>
            </tr>`).join('')}</tbody>
          </table>` : '<p style="color:var(--text-muted);font-size:.85rem;">No members assigned.</p>'}
      </div>

      <hr style="border-color:var(--bg-panel-border);margin:1rem 0;">

      <!-- Add New Member -->
      <h4 style="font-size:.9rem;color:var(--text-secondary);margin-bottom:.5rem;">Add Member</h4>
      <div style="display:grid;grid-template-columns:1fr auto auto;gap:.5rem;align-items:end;">
        <div class="form-group" style="margin-bottom:0;">
          <select id="add-member-user" class="form-control">
            <option value="">Select user…</option>
            ${allUsers?.filter(u => !currentMembers.some(m => m.user_id === u.id))
              .map(u => `<option value="${u.id}">${u.name} (${u.email})</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <select id="add-member-type" class="form-control">
            ${owner ? '' : '<option value="Owner">Owner</option>'}
            <option value="Resident">Resident</option>
          </select>
        </div>
        <button class="btn btn-primary" id="btn-add-member-submit" style="height:38px;">
          <i class="fa-solid fa-plus"></i> Add
        </button>
      </div>
    </div>`, []);

  // Wire remove member
  window._removeMember = async (memberId) => {
    if (!confirm('Remove this member?')) return;
    const { error } = await supabase.from('members').update({ is_active: false, move_out_date: new Date().toISOString().split('T')[0], updated_at: new Date().toISOString() }).eq('id', memberId);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Member removed', 'success');
    closeModal();
    await loadUnits();
    const { data: updated } = await supabase.from('units').select('*, members(id,user_id,member_type,is_active,users(id,name,email,phone))').eq('id', unit.id).single();
    if (updated) manageMembersModal(updated);
  };

  // Wire add member
  document.getElementById('btn-add-member-submit')?.addEventListener('click', async () => {
    const userId = document.getElementById('add-member-user')?.value;
    const memberType = document.getElementById('add-member-type')?.value;
    if (!userId) { showToast('Select a user', 'warning'); return; }

    const { error } = await supabase.from('members').insert({
      unit_id: unit.id, user_id: userId, member_type: memberType, is_active: true
    });
    if (error) { showToast(error.message, 'error'); return; }

    // Mark unit as occupied
    if (unit.status === 'Vacant') {
      await supabase.from('units').update({ status: 'Occupied', updated_at: new Date().toISOString() }).eq('id', unit.id);
    }

    showToast('Member added!', 'success');
    closeModal();
    await loadUnits();
    const { data: updated } = await supabase.from('units').select('*, members(id,user_id,member_type,is_active,users(id,name,email,phone))').eq('id', unit.id).single();
    if (updated) manageMembersModal(updated);
  });
}

/* ── Helper: wire up resident multi-select chips ── */
function _wireResidentSelect() {
  const select = document.getElementById('unit-resident-select');
  const container = document.getElementById('selected-residents');
  if (!select || !container) return;

  const _selectedResidents = new Set();

  select.addEventListener('change', () => {
    const val = select.value;
    if (!val || _selectedResidents.has(val)) { select.value = ''; return; }
    _selectedResidents.add(val);
    const opt = select.querySelector(`option[value="${val}"]`);
    const chip = document.createElement('span');
    chip.className = 'badge badge-info member-chip';
    chip.dataset.userId = val;
    chip.style.cssText = 'cursor:pointer;padding:0.35rem 0.75rem;font-size:0.8rem;';
    chip.innerHTML = `${opt.textContent} <i class="fa-solid fa-xmark" style="margin-left:4px;"></i>`;
    chip.addEventListener('click', () => {
      _selectedResidents.delete(val);
      chip.remove();
    });
    container.appendChild(chip);
    select.value = '';
  });
}
