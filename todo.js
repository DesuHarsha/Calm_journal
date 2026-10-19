/* Calm Journal To-Do tab. Tasks are stored locally on this device. */
(() => {
'use strict';
const KEY='calm-journal-tasks-v1', nav=document.getElementById('nav'), app=document.getElementById('app');
if(!nav||!app)return;
const day=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel=k=>{if(!k)return 'Earlier';const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString(undefined,{month:'short',day:'numeric'})};
const load=()=>{try{const a=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?a.filter(t=>t&&t.id&&typeof t.text==='string'):[]}catch(_){return []}};
const save=a=>{try{localStorage.setItem(KEY,JSON.stringify(a));return true}catch(_){alert('Could not save tasks on this device.');return false}};
let opened=false;
function render(){
 opened=true;
 nav.querySelectorAll('[data-nav]').forEach(b=>{const active=b.dataset.nav==='todo';b.classList.toggle('on',active);b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
 const tasks=load(), pending=tasks.filter(t=>!t.completed).sort((a,b)=>(a.createdDate||'').localeCompare(b.createdDate||'')||(a.createdAt||0)-(b.createdAt||0));
 const done=tasks.filter(t=>t.completed&&t.completedDate===day()), pct=pending.length+done.length?Math.round(done.length/(pending.length+done.length)*100):0;
 const item=(t,isDone=false)=>`<li class="todo-item ${t.completed?'is-done':''}"><input class="todo-check" type="checkbox" data-check="${esc(t.id)}" aria-label="Mark task complete" ${t.completed?'checked':''}><span class="todo-task-text">${esc(t.text)}<span class="todo-task-meta">${isDone?'Completed '+dateLabel(t.completedDate):(t.createdDate&&t.createdDate!==day()?'Carryover · added '+dateLabel(t.createdDate):'Today')}</span></span><button class="todo-delete" type="button" data-delete="${esc(t.id)}" aria-label="Delete task">×</button></li>`;
 app.innerHTML=`<section class="todo-page"><header class="todo-heading"><div><h1>To-Do</h1><p class="todo-subtitle">${new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</p></div></header>
 <div class="todo-progress"><div class="todo-progress-top"><span>Today's progress</span><strong>${done.length} completed</strong></div><div class="todo-progress-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="todo-progress-fill" style="width:${pct}%"></div></div></div>
 <form class="todo-add" id="todo-form"><input id="todo-input" type="text" maxlength="240" placeholder="What needs to get done?" aria-label="New task" autocomplete="off" required><button type="submit">Add</button></form>
 <h2 class="todo-section-label">To do · ${pending.length}</h2>${pending.length?`<ul class="todo-list">${pending.map(t=>item(t)).join('')}</ul>`:'<div class="todo-empty">You’re all caught up. Add a task when you’re ready.</div>'}
 ${done.length?`<h2 class="todo-section-label">Completed today · ${done.length}</h2><ul class="todo-list">${done.map(t=>item(t,true)).join('')}</ul>`:''}
 <p class="todo-note">Unfinished tasks carry forward automatically until completed or deleted. Tasks are saved in this browser on this iPhone.</p></section>`;
 document.getElementById('todo-form').addEventListener('submit',e=>{e.preventDefault();const input=document.getElementById('todo-input'),text=input.value.trim();if(!text)return;const a=load();a.push({id:`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,text,createdDate:day(),createdAt:Date.now(),completed:false,completedDate:null});if(save(a))render();const next=document.getElementById('todo-input');if(next)next.focus()});
 app.querySelectorAll('[data-check]').forEach(el=>el.addEventListener('change',()=>{const a=load(),t=a.find(x=>x.id===el.dataset.check);if(t){t.completed=el.checked;t.completedDate=el.checked?day():null;save(a);render()}}));
 app.querySelectorAll('[data-delete]').forEach(el=>el.addEventListener('click',()=>{if(confirm('Delete this task?')){save(load().filter(t=>t.id!==el.dataset.delete));render()}}));
}
nav.addEventListener('click',e=>{const b=e.target.closest('[data-nav]');if(!b||b.dataset.nav!=='todo'){if(opened){opened=false;nav.querySelectorAll('[data-nav="todo"]').forEach(x=>{x.classList.remove('active');x.removeAttribute('aria-current')})}return}e.preventDefault();e.stopImmediatePropagation();render()},true);
})();
