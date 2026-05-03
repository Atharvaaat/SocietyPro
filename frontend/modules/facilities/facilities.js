/**
 * Facilities Module — Amenities, Bookings, Assets, Vendors
 * frontend/modules/facilities/facilities.js
 */
import { supabase } from '../../lib/supabase.js';
import { hasRole, currentUser } from '../auth/auth.js';
import { showToast, openModal, closeModal } from '../../lib/ui.js';

export async function render(container) {
  container.innerHTML = `
    <div class="animate-fade-in">
      <div class="tab-bar">
        <button class="tab-btn active" data-tab="bookings">Amenity Bookings</button>
        <button class="tab-btn" data-tab="assets">Assets & AMC</button>
        <button class="tab-btn" data-tab="vendors">Vendors</button>
      </div>
      <div id="fac-content" style="margin-top:1rem;"></div>
    </div>`;
  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.addEventListener('click',()=>{
      document.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); loadFacTab(b.dataset.tab);
    });
  });
  loadFacTab('bookings');
}

function loadFacTab(tab) {
  const c=document.getElementById('fac-content');
  if(tab==='bookings') renderBookings(c);
  else if(tab==='assets') renderAssets(c);
  else if(tab==='vendors') renderVendors(c);
}

/* ── BOOKINGS ── */
async function renderBookings(container) {
  const {data:amenities}=await supabase.from('amenities').select('*').eq('is_active',true).order('name');
  const {data:bookings}=await supabase.from('amenity_bookings')
    .select('*,amenities(name),units(unit_number),members(name)')
    .order('booking_date',{ascending:false}).limit(30);
  container.innerHTML=`
    <div class="page-toolbar">
      <button class="btn btn-primary" id="btn-book-amenity"><i class="fa-solid fa-plus"></i> Book Amenity</button>
      ${hasRole('secretary','manager')?`<button class="btn btn-outline" id="btn-add-amenity"><i class="fa-solid fa-plus"></i> Add Amenity</button>`:''}
    </div>
    <div class="card" style="overflow:hidden;margin-top:1rem;">
      <table class="data-table">
        <thead><tr><th>Amenity</th><th>Unit</th><th>Date</th><th>Slot</th><th>Fee</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>${bookings?.map(b=>`<tr>
          <td>${b.amenities?.name||'—'}</td>
          <td>${b.units?.unit_number||'—'}</td>
          <td>${new Date(b.booking_date).toLocaleDateString('en-IN')}</td>
          <td>${b.time_slot||'—'}</td>
          <td>${b.fee_charged>0?'₹'+b.fee_charged:'Free'}</td>
          <td><span class="badge badge-${b.status==='Confirmed'?'success':b.status==='Cancelled'?'danger':'secondary'}">${b.status}</span></td>
          <td>${b.status==='Confirmed'?`<button class="btn btn-sm btn-danger" onclick="window._cancelBooking('${b.id}')">Cancel</button>`:''}
          </td>
        </tr>`).join('')||'<tr><td colspan="7" style="text-align:center">No bookings.</td></tr>'}</tbody>
      </table>
    </div>`;
  document.getElementById('btn-book-amenity')?.addEventListener('click',()=>bookAmenityModal(amenities));
  document.getElementById('btn-add-amenity')?.addEventListener('click',addAmenityModal);
  window._cancelBooking=async(id)=>{
    await supabase.from('amenity_bookings').update({status:'Cancelled'}).eq('id',id);
    showToast('Booking cancelled','info'); renderBookings(container);
  };
}

async function bookAmenityModal(amenities) {
  const {data:units}=await supabase.from('units').select('id,unit_number').order('unit_number');
  const slots=['6:00 AM – 8:00 AM','8:00 AM – 10:00 AM','10:00 AM – 12:00 PM','4:00 PM – 6:00 PM','6:00 PM – 8:00 PM','8:00 PM – 10:00 PM'];
  openModal('Book Amenity', `
    <form id="booking-form">
      <div class="form-group"><label class="form-label">Amenity *</label>
        <select name="amenity_id" class="form-control" required>
          <option value="">Select…</option>
          ${amenities?.map(a=>`<option value="${a.id}">${a.name}${a.booking_fee>0?' (₹'+a.booking_fee+')':' (Free)'}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Unit *</label>
        <select name="unit_id" class="form-control" required>
          <option value="">Select…</option>
          ${units?.map(u=>`<option value="${u.id}">${u.unit_number}</option>`).join('')}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Date *</label><input name="booking_date" type="date" class="form-control" required min="${new Date().toISOString().split('T')[0]}"></div>
        <div class="form-group"><label class="form-label">Time Slot *</label>
          <select name="time_slot" class="form-control" required>
            ${slots.map(s=>`<option>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Purpose</label><input name="purpose" class="form-control" placeholder="Birthday party, Yoga class…"></div>
    </form>`,
    [{ label:'Confirm Booking', class:'btn btn-primary', action: async()=>{
      const fd=new FormData(document.getElementById('booking-form'));
      const obj=Object.fromEntries(fd);
      const {data:conflict}=await supabase.from('amenity_bookings').select('id').eq('amenity_id',obj.amenity_id).eq('booking_date',obj.booking_date).eq('time_slot',obj.time_slot).eq('status','Confirmed');
      if(conflict?.length){showToast('This slot is already booked!','error');return false;}
      const {data:amen}=await supabase.from('amenities').select('booking_fee').eq('id',obj.amenity_id).single();
      const {error}=await supabase.from('amenity_bookings').insert({...obj,fee_charged:amen?.booking_fee||0});
      if(error){showToast(error.message,'error');return false;}
      showToast('Booking confirmed!','success'); closeModal(); renderBookings(container);
    }}]
  );
}

async function addAmenityModal() {
  openModal('Add Amenity', `
    <form id="amen-form">
      <div class="form-group"><label class="form-label">Name *</label><input name="name" class="form-control" required></div>
      <div class="form-group"><label class="form-label">Description</label><textarea name="description" class="form-control" rows="2"></textarea></div>
      <div class="form-group"><label class="form-label">Booking Fee (₹)</label><input name="booking_fee" type="number" class="form-control" value="0"></div>
    </form>`,
    [{ label:'Add', class:'btn btn-primary', action: async()=>{
      const fd=new FormData(document.getElementById('amen-form'));
      const {error}=await supabase.from('amenities').insert(Object.fromEntries(fd));
      if(error){showToast(error.message,'error');return false;}
      showToast('Amenity added!','success'); closeModal(); loadFacTab('bookings');
    }}]
  );
}

/* ── ASSETS ── */
async function renderAssets(container) {
  const {data:assets}=await supabase.from('assets').select('*').order('amc_expiry');
  container.innerHTML=`
    <div class="page-toolbar">
      ${hasRole('secretary','manager')?`<button class="btn btn-primary" id="btn-add-asset"><i class="fa-solid fa-plus"></i> Add Asset</button>`:''}
    </div>
    <div class="card" style="overflow:hidden;margin-top:1rem;">
      <table class="data-table">
        <thead><tr><th>Asset</th><th>Location</th><th>AMC Vendor</th><th>AMC Expiry</th><th>Last Service</th><th>Status</th></tr></thead>
        <tbody>${assets?.map(a=>{
          const sc={OK:'success','Expiring Soon':'warning',Expired:'danger','Under Repair':'secondary'}[a.status]||'';
          return `<tr>
            <td><strong>${a.name}</strong></td>
            <td>${a.location||'—'}</td>
            <td>${a.amc_vendor||'—'}</td>
            <td>${a.amc_expiry?new Date(a.amc_expiry).toLocaleDateString('en-IN'):'—'}</td>
            <td>${a.last_service?new Date(a.last_service).toLocaleDateString('en-IN'):'—'}</td>
            <td><span class="badge badge-${sc}">${a.status}</span></td>
          </tr>`;
        }).join('')||'<tr><td colspan="6" style="text-align:center">No assets.</td></tr>'}</tbody>
      </table>
    </div>`;
  document.getElementById('btn-add-asset')?.addEventListener('click', addAssetModal);
}

async function addAssetModal() {
  openModal('Add Asset', `
    <form id="asset-form">
      <div class="form-group"><label class="form-label">Name *</label><input name="name" class="form-control" required></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Location</label><input name="location" class="form-control"></div>
        <div class="form-group"><label class="form-label">AMC Vendor</label><input name="amc_vendor" class="form-control"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">AMC Expiry</label><input name="amc_expiry" type="date" class="form-control"></div>
        <div class="form-group"><label class="form-label">Last Service</label><input name="last_service" type="date" class="form-control"></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea name="notes" class="form-control" rows="2"></textarea></div>
    </form>`,
    [{ label:'Add Asset', class:'btn btn-primary', action: async()=>{
      const fd=new FormData(document.getElementById('asset-form'));
      const {error}=await supabase.from('assets').insert(Object.fromEntries(fd));
      if(error){showToast(error.message,'error');return false;}
      showToast('Asset added!','success'); closeModal(); renderAssets(document.getElementById('fac-content'));
    }}]
  );
}

/* ── VENDORS ── */
async function renderVendors(container) {
  const {data:vendors}=await supabase.from('vendors').select('*').order('name');
  container.innerHTML=`
    <div class="page-toolbar">
      ${hasRole('secretary','manager')?`<button class="btn btn-primary" id="btn-add-vendor"><i class="fa-solid fa-plus"></i> Add Vendor</button>`:''}
    </div>
    <div class="card" style="overflow:hidden;margin-top:1rem;">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Service</th><th>Contact</th><th>Phone</th><th>Rating</th><th>Status</th></tr></thead>
        <tbody>${vendors?.map(v=>`<tr>
          <td><strong>${v.name}</strong></td>
          <td>${v.service_type||'—'}</td>
          <td>${v.contact_name||'—'}</td>
          <td>${v.phone||'—'}</td>
          <td>${'★'.repeat(v.rating||3)}${'☆'.repeat(5-(v.rating||3))}</td>
          <td><span class="badge badge-${v.contract_status==='Active'?'success':'secondary'}">${v.contract_status}</span></td>
        </tr>`).join('')||'<tr><td colspan="6" style="text-align:center">No vendors.</td></tr>'}</tbody>
      </table>
    </div>`;
  document.getElementById('btn-add-vendor')?.addEventListener('click', addVendorModal);
}

async function addVendorModal() {
  openModal('Add Vendor', `
    <form id="vendor-form">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Name *</label><input name="name" class="form-control" required></div>
        <div class="form-group"><label class="form-label">Service Type *</label><input name="service_type" class="form-control" required></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Contact Name</label><input name="contact_name" class="form-control"></div>
        <div class="form-group"><label class="form-label">Phone</label><input name="phone" class="form-control"></div>
      </div>
      <div class="form-group"><label class="form-label">Email</label><input name="email" type="email" class="form-control"></div>
      <div class="form-group"><label class="form-label">Rating (1-5)</label><input name="rating" type="number" min="1" max="5" value="3" class="form-control"></div>
    </form>`,
    [{ label:'Add', class:'btn btn-primary', action: async()=>{
      const fd=new FormData(document.getElementById('vendor-form'));
      const {error}=await supabase.from('vendors').insert(Object.fromEntries(fd));
      if(error){showToast(error.message,'error');return false;}
      showToast('Vendor added!','success'); closeModal(); renderVendors(document.getElementById('fac-content'));
    }}]
  );
}
