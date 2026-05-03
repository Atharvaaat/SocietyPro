/**
 * Communication Module — Notices, Polls, Meetings
 * frontend/modules/communication/communication.js
 */
import { supabase, callBackend } from '../../lib/supabase.js';
import { hasRole, currentUser } from '../auth/auth.js';
import { showToast, openModal, closeModal } from '../../lib/ui.js';

export async function render(container) {
  container.innerHTML = `
    <div class="animate-fade-in">
      <div class="tab-bar">
        <button class="tab-btn active" data-tab="notices">Notices</button>
        <button class="tab-btn" data-tab="polls">Polls</button>
        <button class="tab-btn" data-tab="meetings">Meetings</button>
        <button class="tab-btn" data-tab="emergency">Emergency</button>
      </div>
      <div id="comm-content" style="margin-top:1rem;"></div>
    </div>`;
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      loadCommTab(b.dataset.tab);
    });
  });
  loadCommTab('notices');
}

function loadCommTab(tab) {
  const content = document.getElementById('comm-content');
  if (tab === 'notices')   renderNotices(content);
  else if (tab === 'polls')    renderPolls(content);
  else if (tab === 'meetings') renderMeetings(content);
  else if (tab === 'emergency') renderEmergency(content);
}

/* ── NOTICES ── */
async function renderNotices(container) {
  const {data:notices}=await supabase.from('notices')
    .select('*,users!posted_by(name)').eq('is_published',true).order('created_at',{ascending:false});
  container.innerHTML=`
    <div class="page-toolbar">
      ${hasRole('secretary','manager')?`<button class="btn btn-primary" id="btn-post-notice"><i class="fa-solid fa-plus"></i> Post Notice</button>`:''}
    </div>
    <div style="display:flex;flex-direction:column;gap:1rem;margin-top:1rem;">
      ${notices?.map(n=>`
        <div class="card" style="padding:1.25rem;border-left:4px solid ${n.priority==='Urgent'?'var(--status-danger)':'var(--accent-primary)'};">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
              ${n.priority==='Urgent'?`<span class="badge badge-danger" style="margin-bottom:.5rem">URGENT</span>`:''}
              <h3 style="margin:0 0 .5rem;font-size:1.05rem;">${n.title}</h3>
              <p style="margin:0;color:var(--text-secondary);white-space:pre-line;">${n.body}</p>
            </div>
            ${hasRole('secretary')?`<button class="icon-btn" onclick="window._unpublishNotice('${n.id}')"><i class="fa-solid fa-eye-slash"></i></button>`:''}
          </div>
          <div style="margin-top:.75rem;font-size:.8rem;color:var(--text-muted)">
            Posted by ${n.users?.name||'—'} · ${new Date(n.created_at).toLocaleDateString('en-IN')}
          </div>
        </div>`).join('')||'<p style="color:var(--text-muted)">No notices posted.</p>'}
    </div>`;
  document.getElementById('btn-post-notice')?.addEventListener('click', postNoticeModal);
  window._unpublishNotice=async(id)=>{
    await supabase.from('notices').update({is_published:false}).eq('id',id);
    showToast('Notice unpublished','info'); renderNotices(container);
  };
}

async function postNoticeModal() {
  openModal('Post Notice', `
    <form id="notice-form">
      <div class="form-group"><label class="form-label">Title *</label><input name="title" class="form-control" required></div>
      <div class="form-group"><label class="form-label">Body *</label><textarea name="body" class="form-control" rows="4" required></textarea></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Category</label>
          <select name="category" class="form-control"><option>General</option><option>Maintenance</option><option>Event</option><option>Billing</option><option>Safety</option></select>
        </div>
        <div class="form-group"><label class="form-label">Priority</label>
          <select name="priority" class="form-control"><option>Normal</option><option>Urgent</option></select>
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;">
        <input type="checkbox" name="send_email" value="1"> Send email to all residents
      </label>
      <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;margin-top:.5rem;">
        <input type="checkbox" name="send_sms" value="1"> Send SMS to all residents
      </label>
    </form>`,
    [{ label:'Post', class:'btn btn-primary', action: async()=>{
      const fd=new FormData(document.getElementById('notice-form'));
      const obj=Object.fromEntries(fd);
      const {data,error}=await supabase.from('notices').insert({
        title:obj.title, body:obj.body, category:obj.category, priority:obj.priority, posted_by:currentUser.id
      }).select().single();
      if(error){showToast(error.message,'error');return false;}
      if(obj.send_email){
        const {data:members}=await supabase.from('members').select('email').eq('is_active',true).not('email','is',null);
        for(const m of members||[]){
          try{await callBackend('/api/notify/email',{to:m.email,subject:`[${obj.priority}] ${obj.title}`,html:`<h2>${obj.title}</h2><p>${obj.body.replace(/\n/g,'<br>')}</p>`});}catch{}
        }
      }
      if(obj.send_sms){
        const {data:members}=await supabase.from('members').select('phone').eq('is_active',true).not('phone','is',null);
        for(const m of members||[]){
          try{await callBackend('/api/notify/sms',{phone:m.phone,message:`[${obj.priority}] ${obj.title}: ${obj.body.slice(0,80)} - SocietyPro`});}catch{}
        }
      }
      showToast('Notice posted!','success'); closeModal(); renderNotices(document.getElementById('comm-content'));
    }}]
  );
}

/* ── POLLS ── */
async function renderPolls(container) {
  const {data:polls}=await supabase.from('polls').select('*,users(name)').order('created_at',{ascending:false});
  container.innerHTML=`
    <div class="page-toolbar">
      ${hasRole('secretary','manager')?`<button class="btn btn-primary" id="btn-create-poll"><i class="fa-solid fa-plus"></i> Create Poll</button>`:''}
    </div>
    <div style="display:flex;flex-direction:column;gap:1rem;margin-top:1rem;">
      ${polls?.map(p=>{
        const opts=Array.isArray(p.options)?p.options:JSON.parse(p.options||'[]');
        const expired=p.deadline&&new Date(p.deadline)<new Date();
        return `<div class="card" style="padding:1.25rem;">
          <div style="display:flex;justify-content:space-between;">
            <h3 style="margin:0 0 1rem;font-size:1rem;">${p.question}</h3>
            <span class="badge badge-${p.is_active&&!expired?'success':'secondary'}">${p.is_active&&!expired?'Active':'Closed'}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:.5rem;">
            ${opts.map((opt,i)=>`
              <div style="display:flex;align-items:center;gap:.75rem;">
                <button class="btn btn-outline btn-sm" onclick="window._vote('${p.id}',${i})" ${!p.is_active||expired?'disabled':''}>Vote</button>
                <span>${opt}</span>
              </div>`).join('')}
          </div>
          <div style="margin-top:.75rem;font-size:.8rem;color:var(--text-muted)">
            Deadline: ${p.deadline?new Date(p.deadline).toLocaleDateString('en-IN'):'No deadline'} · By ${p.users?.name||'—'}
          </div>
        </div>`;
      }).join('')||'<p style="color:var(--text-muted)">No polls.</p>'}
    </div>`;
  document.getElementById('btn-create-poll')?.addEventListener('click', createPollModal);
  window._vote=async(pollId,optIdx)=>{
    const {data:members}=await supabase.from('members').select('id').eq('user_id',currentUser.id).limit(1);
    const memberId=members?.[0]?.id;
    if(!memberId){showToast('Only registered members can vote','warning');return;}
    const {error}=await supabase.from('poll_votes').upsert({poll_id:pollId,member_id:memberId,option_idx:optIdx},{onConflict:'poll_id,member_id'});
    if(error){showToast(error.message,'error');return;}
    showToast('Vote recorded!','success'); renderPolls(document.getElementById('comm-content'));
  };
}

async function createPollModal() {
  openModal('Create Poll', `
    <form id="poll-form">
      <div class="form-group"><label class="form-label">Question *</label><input name="question" class="form-control" required></div>
      <div class="form-group"><label class="form-label">Options (one per line, min 2) *</label><textarea name="options" class="form-control" rows="4" required placeholder="Option A&#10;Option B&#10;Option C"></textarea></div>
      <div class="form-group"><label class="form-label">Deadline</label><input name="deadline" type="date" class="form-control"></div>
    </form>`,
    [{ label:'Create', class:'btn btn-primary', action: async()=>{
      const fd=new FormData(document.getElementById('poll-form'));
      const obj=Object.fromEntries(fd);
      const opts=obj.options.split('\n').map(s=>s.trim()).filter(Boolean);
      if(opts.length<2){showToast('Need at least 2 options','warning');return false;}
      const {error}=await supabase.from('polls').insert({question:obj.question,options:JSON.stringify(opts),deadline:obj.deadline||null,created_by:currentUser.id});
      if(error){showToast(error.message,'error');return false;}
      showToast('Poll created!','success'); closeModal(); renderPolls(document.getElementById('comm-content'));
    }}]
  );
}

/* ── MEETINGS ── */
async function renderMeetings(container) {
  const {data:meetings}=await supabase.from('meetings').select('*,users(name)').order('meeting_date',{ascending:false});
  container.innerHTML=`
    <div class="page-toolbar">
      ${hasRole('secretary')?`<button class="btn btn-primary" id="btn-schedule-meeting"><i class="fa-solid fa-plus"></i> Schedule Meeting</button>`:''}
    </div>
    <div style="display:flex;flex-direction:column;gap:1rem;margin-top:1rem;">
      ${meetings?.map(m=>`
        <div class="card" style="padding:1.25rem;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
              <h3 style="margin:0 0 .25rem">${m.title}</h3>
              <div style="font-size:.85rem;color:var(--text-muted)">
                📅 ${new Date(m.meeting_date).toLocaleString('en-IN')} · 📍 ${m.venue||'TBD'}
              </div>
              ${m.agenda?`<p style="margin:.75rem 0 0;font-size:.9rem;">${m.agenda}</p>`:''}
            </div>
            <span class="badge badge-${m.status==='Upcoming'?'info':m.status==='Completed'?'success':'secondary'}">${m.status}</span>
          </div>
        </div>`).join('')||'<p style="color:var(--text-muted)">No meetings scheduled.</p>'}
    </div>`;
  document.getElementById('btn-schedule-meeting')?.addEventListener('click', scheduleMeetingModal);
}

async function scheduleMeetingModal() {
  openModal('Schedule Meeting', `
    <form id="meeting-form">
      <div class="form-group"><label class="form-label">Title *</label><input name="title" class="form-control" required></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Date & Time *</label><input name="meeting_date" type="datetime-local" class="form-control" required></div>
        <div class="form-group"><label class="form-label">Venue *</label><input name="venue" class="form-control" required placeholder="Clubhouse"></div>
      </div>
      <div class="form-group"><label class="form-label">Agenda</label><textarea name="agenda" class="form-control" rows="3"></textarea></div>
      <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;">
        <input type="checkbox" name="notify" value="1"> Notify all residents via email + SMS
      </label>
    </form>`,
    [{ label:'Schedule', class:'btn btn-primary', action: async()=>{
      const fd=new FormData(document.getElementById('meeting-form'));
      const obj=Object.fromEntries(fd);
      const {error}=await supabase.from('meetings').insert({title:obj.title,agenda:obj.agenda||null,venue:obj.venue,meeting_date:obj.meeting_date,created_by:currentUser.id});
      if(error){showToast(error.message,'error');return false;}
      if(obj.notify){
        const {data:members}=await supabase.from('members').select('email,phone').eq('is_active',true);
        for(const m of members||[]){
          const dt=new Date(obj.meeting_date).toLocaleString('en-IN');
          if(m.email) try{await callBackend('/api/notify/email',{to:m.email,subject:`Meeting: ${obj.title}`,html:`<h2>${obj.title}</h2><p>Date: ${dt}<br>Venue: ${obj.venue}</p>`});}catch{}
          if(m.phone) try{await callBackend('/api/notify/sms',{phone:m.phone,message:`Meeting: ${obj.title} on ${dt} at ${obj.venue} - SocietyPro`});}catch{}
        }
      }
      showToast('Meeting scheduled!','success'); closeModal(); renderMeetings(document.getElementById('comm-content'));
    }}]
  );
}

/* ── EMERGENCY DIRECTORY ── */
function renderEmergency(container) {
  const contacts=[
    {name:'Police Control Room',number:'100',icon:'🚔'},
    {name:'Fire Brigade',number:'101',icon:'🚒'},
    {name:'Ambulance',number:'108',icon:'🚑'},
    {name:'Women Helpline',number:'1091',icon:'👩'},
    {name:'Electricity',number:'1916',icon:'⚡'},
    {name:'BMC Helpline',number:'1916',icon:'🏛'},
  ];
  container.innerHTML=`
    <div class="card" style="padding:1.5rem;">
      <h3 style="margin-bottom:1rem;">Emergency Contacts</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem;">
        ${contacts.map(c=>`
          <div class="card" style="padding:1rem;text-align:center;cursor:pointer;" onclick="window.location.href='tel:${c.number}'">
            <div style="font-size:2rem;margin-bottom:.5rem;">${c.icon}</div>
            <div style="font-weight:600">${c.name}</div>
            <div style="font-size:1.25rem;font-weight:700;color:var(--accent-primary)">${c.number}</div>
          </div>`).join('')}
      </div>
    </div>`;
}
