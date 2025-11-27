const $ = id => document.getElementById(id);

const API = (path, opts = {}) => {
  const token = localStorage.getItem('token');
  const headers = Object.assign({'Content-Type':'application/json'}, opts.headers || {});
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return fetch(path, Object.assign({headers}, opts)).then(async res => {
    const text = await res.text();
    try { return JSON.parse(text); } catch(e){ return text; }
  });
};

function showAuth(show){
  $('auth').style.display = show ? 'block' : 'none';
  $('app').style.display = show ? 'none' : 'block';
}

async function refreshItems(){
  const data = await API('/api/wishlist');
  if (data && data.items) {
    const cont = $('items'); cont.innerHTML = '';
    data.items.forEach(it => {
      const div = document.createElement('div'); div.className = 'item';
      div.innerHTML = `<strong>${escapeHtml(it.title)}</strong> ${it.link?`<a href="${escapeHtml(it.link)}" target="_blank">(link)</a>`:''}<div>Recommended: ${it.is_recommended}</div><div style="margin-top:6px"><button data-id="${it.id}" class="del">Delete</button></div>`;
      cont.appendChild(div);
    });
    document.querySelectorAll('.del').forEach(btn=>btn.addEventListener('click', async e=>{
      const id = e.target.getAttribute('data-id');
      await API('/api/wishlist/'+id, { method: 'DELETE' });
      refreshItems();
    }));
  }
}

async function getRecs(){
  const count = parseInt($('recCount').value || '5', 10);
  const data = await API('/api/recommendations?count='+count);
  const cont = $('recs'); cont.innerHTML = '';
  if (data && data.items) {
    data.items.forEach(it => {
      const d = document.createElement('div'); d.className='item';
      d.innerHTML = `<strong>${escapeHtml(it.title)}</strong> ${it.link?`<a href="${escapeHtml(it.link)}" target="_blank">(link)</a>`:''}`;
      cont.appendChild(d);
    });
  }
}

function escapeHtml(s){
  if (!s) return '';
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

$('btnLogin').addEventListener('click', async ()=>{
  const email = $('email').value; const password = $('password').value;
  const res = await API('/login', { method: 'POST', body: JSON.stringify({email,password}) });
  if (res && res.token) { localStorage.setItem('token', res.token); showAuth(false); refreshItems(); } else { $('authMsg').textContent = res.error || 'Login failed'; }
});

$('btnRegister').addEventListener('click', async ()=>{
  const email = $('email').value; const password = $('password').value;
  const res = await API('/register', { method: 'POST', body: JSON.stringify({email,password}) });
  if (res && res.token) { localStorage.setItem('token', res.token); showAuth(false); refreshItems(); } else { $('authMsg').textContent = res.error || 'Register failed'; }
});

$('btnLogout').addEventListener('click', ()=>{ localStorage.removeItem('token'); showAuth(true); });

$('btnAdd').addEventListener('click', async ()=>{
  const title = $('itemTitle').value; const link = $('itemLink').value; const is_recommended = $('itemRec').checked;
  await API('/api/wishlist', { method: 'POST', body: JSON.stringify({title,link,is_recommended}) });
  $('itemTitle').value=''; $('itemLink').value=''; $('itemRec').checked=false; refreshItems();
});

$('btnGetRecs').addEventListener('click', getRecs);

// On load
document.addEventListener('DOMContentLoaded', ()=>{
  const token = localStorage.getItem('token');
  if (!token) { showAuth(true); } else { showAuth(false); refreshItems(); }
});
