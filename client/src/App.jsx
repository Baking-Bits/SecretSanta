import React, { useEffect, useState } from 'react'
import './index.css'

// Debugging aid: log when the module is evaluated
console.log('[dev] App.jsx module loaded')

const API = async (path, opts = {}) => {
  const token = localStorage.getItem('token')
  const headers = Object.assign({'Content-Type':'application/json'}, opts.headers || {})
  if (token) headers['Authorization'] = 'Bearer ' + token

  // In dev, bypass Vite proxy and call backend directly to avoid proxy edge-cases.
  let base = ''
  try {
    // Prefer explicit Vite-provided backend URL when available for deterministic behavior
    // during development: `VITE_API_BASE` (e.g. http://127.0.0.1:3078)
    try {
      const viteBase = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE) ? import.meta.env.VITE_API_BASE : null;
      if (viteBase) {
        base = viteBase
      }
    } catch (_) {}

    if (typeof window !== 'undefined' && window.location) {
      // Treat common Vite dev ports and localhost/127.0.0.1 as development so the client calls the backend directly.
      const port = String(window.location.port || '');
      const host = String(window.location.hostname || '');
      const devPorts = ['5173', '5174', '5175'];
      if (devPorts.includes(port) || host === 'localhost' || host === '127.0.0.1') {
        base = base || 'http://127.0.0.1:3078'
      }
    }
  } catch (err) {
    // ignore
  }

  const url = base + path
  const res = await fetch(url, Object.assign({ headers }, opts))
  const text = await res.text()

  // If the server returned an HTML document (index.html), surface a clearer error
  if (typeof text === 'string' && text.trim().toLowerCase().startsWith('<!doctype html>')) {
    console.warn('API returned HTML (likely wrong origin or proxy).', { path, url, body: text.slice(0,200) })
    return { error: 'Unexpected HTML response from server', raw: text }
  }

  try { return JSON.parse(text) } catch(e) { return text }
}

function escapeHtml(s){
  if (!s) return ''
  return s.replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'})[c])
}
const getInitialRevealState = () => {
  try {
    return localStorage.getItem('hasRevealed') === '1'
  } catch (err) {
    console.warn('Unable to read reveal state', err)
    return false
  }
}

export default function App(){
  useEffect(()=>{
    console.log('[dev] App mounted')
  }, [])
  const [authed, setAuthed] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [items, setItems] = useState([])
  const [title, setTitle] = useState('')
  const [link, setLink] = useState('')
  const [isRec, setIsRec] = useState(false)
  const [recs, setRecs] = useState([])
  const [msg, setMsg] = useState('')
  const [profiles, setProfiles] = useState([])
  const [myClaim, setMyClaim] = useState(null)
  const [claimLoading, setClaimLoading] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [viewingProfileId, setViewingProfileId] = useState(null)
  const [myAssignment, setMyAssignment] = useState(null)
  const [previewAssignments, setPreviewAssignments] = useState(null)
  const [revealModal, setRevealModal] = useState(false)
  const [revealLoading, setRevealLoading] = useState(false)
  const [revealResult, setRevealResult] = useState(null)
  const [page, setPage] = useState('home')
  const [recipientItems, setRecipientItems] = useState([])
  const [drawExists, setDrawExists] = useState(false)
  const [hasRevealed, setHasRevealed] = useState(getInitialRevealState)

  useEffect(()=>{
    const token = localStorage.getItem('token')
    if (!token) return
    ;(async ()=>{
      const me = await API('/api/me')
      if (me && me.user) {
        setCurrentUser(me.user)
        setAuthed(true)
        refreshItems()
      } else {
        setAuthed(true)
        refreshItems()
      }
    })()
  }, [])

  useEffect(()=>{
    if (!authed) return
    ;(async ()=>{
      try{
        const res = await API('/api/my-claim')
        if (res && res.claim) {
          setMyClaim(res.claim)
          setViewingProfileId(res.claim.id)
        } else {
          // still fetch profiles below
        }
        // Always fetch profiles so we can show helpful info (partner names, exclusions)
        const p = await API('/api/profiles')
        if (p && p.profiles) setProfiles(p.profiles)

        const ds = await API('/api/draw-status')
        if (ds && typeof ds.hasAssignments !== 'undefined') setDrawExists(!!ds.hasAssignments)
      }catch(e){
        console.warn('Could not fetch claim/profiles', e)
      }
    })()
  }, [authed])

  useEffect(()=>{
    if (!authed) return
    if (page === 'home') fetchMyAssignment()
  }, [page, authed])
  const deleteItem = async (id) => {
    if (!confirm('Remove this item from your wishlist?')) return;
    try {
      const res = await API('/api/wishlist/' + id, { method: 'DELETE' });
      if (res && res.ok) {
        refreshItems();
      } else {
        setMsg(res && res.error ? res.error : 'Could not remove item');
      }
    } catch (e) {
      console.error('Delete error', e);
      setMsg('Error removing item');
    }
  }

  const toggleFavorite = async (id, currentlyFavorited) => {
    try {
      // Only allow toggling if current user is the owner of the item
      const it = items.find(x => x.id === id)
      if (!it) return
      const ownerId = it.user_id
      if (!currentUser || currentUser.id !== ownerId) return setMsg('Only the list owner can favourite items on their list')
      if (currentlyFavorited) {
        await API('/api/wishlist/' + id + '/favorite', { method: 'DELETE' });
      } else {
        await API('/api/wishlist/' + id + '/favorite', { method: 'POST' });
      }
      await refreshItems(viewingProfileId)
    } catch (e) {
      console.error('Favorite toggle error', e);
      setMsg('Could not update favorite');
    }
  }

  const getRecs = async ()=>{
    // recommendations feature removed — keep stub for compatibility
    setRecs([])
  }

  const logout = ()=>{
    localStorage.removeItem('token')
    localStorage.removeItem('hasRevealed')
    setHasRevealed(false)
    setAuthed(false)
    setItems([])
    setRecs([])
  }

  // Basic handlers (minimal implementations so UI doesn't throw on missing references)
  const doLogin = async () => {
    try {
      const res = await API('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      if (res && res.token) {
        localStorage.setItem('token', res.token)
        setCurrentUser(res.user || null)
        setAuthed(true)
        setMsg('')
        await refreshItems()
      } else {
        setMsg(res && res.error ? res.error : 'Login failed')
      }
    } catch (e) {
      console.error('Login error', e)
      setMsg('Login error')
    }
  }

  const doRegister = async () => {
    try {
      const res = await API('/api/register', { method: 'POST', body: JSON.stringify({ email, password }) })
      if (res && res.token) {
        localStorage.setItem('token', res.token)
        setCurrentUser(res.user || null)
        setAuthed(true)
        setMsg('')
        await refreshItems()
      } else {
        setMsg(res && res.error ? res.error : 'Register failed')
      }
    } catch (e) {
      console.error('Register error', e)
      setMsg('Register error')
    }
  }

  const refreshItems = async (profileId) => {
    try {
      const pid = profileId || viewingProfileId || (myClaim && myClaim.id)
      const q = pid ? ('?profileId=' + encodeURIComponent(pid)) : ''
      const res = await API('/api/wishlist' + q)
      if (res && res.items) setItems(res.items)
      else setItems([])
    } catch (e) {
      console.error('refreshItems error', e)
      setItems([])
    }
  }

  const fetchMyAssignment = async () => {
    try {
      const r = await API('/api/my-assignment')
      if (r && r.assignment) {
        setMyAssignment(r.assignment)
        if (r.assignment.recipient_profile_id) {
          const rr = await API('/api/wishlist?profileId=' + encodeURIComponent(r.assignment.recipient_profile_id))
          setRecipientItems(rr && rr.items ? rr.items : [])
        }
      } else {
        setMyAssignment(null)
        setRecipientItems([])
      }
    } catch (e) {
      console.error('fetchMyAssignment error', e)
    }
  }

  const addItem = async () => {
    try {
      if (!title) return setMsg('Enter a title')
      const res = await API('/api/wishlist', { method: 'POST', body: JSON.stringify({ title, link }) })
      if (res && res.ok) {
        setTitle('')
        setLink('')
        await refreshItems()
      } else setMsg(res && res.error ? res.error : 'Could not add item')
    } catch (e) {
      console.error('addItem error', e)
      setMsg('Could not add item')
    }
  }

  const copyWishlist = async () => {
    try {
      if (!items || items.length === 0) return alert('No items to copy')
      const header = myClaim && myClaim.name ? `Wishlist for ${myClaim.name}` : 'My Wishlist'
      const lines = [header, '']
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        const linkPart = it.link ? `\nLink: ${it.link}` : ''
        lines.push(`${i+1}. ${it.title}${linkPart}`)
      }
      const text = lines.join('\n') + '\n'
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
        alert('Wishlist copied to clipboard')
        return
      }
      // Fallback method
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      alert('Wishlist copied to clipboard')
    } catch (e) {
      console.error('Copy failed', e)
      alert('Could not copy wishlist')
    }
  }

  const runDraw = async ({ silent } = {}) => {
    const r = await API('/api/draw', { method: 'POST' })
    if (r && r.assignments) {
      setHasRevealed(false)
      localStorage.removeItem('hasRevealed')
      setRevealResult(null)
      await fetchMyAssignment()
      setDrawExists(true)
      if (!silent) alert('Secret Santa activated!')
      return true
    }
    // Prefer server-provided error message when available
    const errMsg = r && r.error ? r.error : 'Activation failed — please try again'
    console.warn('Activation failed response:', r)
    if (!silent) alert(errMsg)
    return false
  }

  const handleRunDraw = async () => {
    await runDraw()
  }

  const handleReveal = async () => {
    if (!drawExists) {
      const ok = await runDraw({ silent: true })
      if (!ok) {
        setMsg('Draw could not be run yet. Please try again or contact admin.')
        return
      }
    }
    setRevealModal(true)
    setRevealLoading(true)
    setRevealResult(null)
    setTimeout(async () => {
      const r = await API('/api/my-assignment')
      if (r && r.assignment) {
        setRevealResult(r.assignment)
        setHasRevealed(true)
        try { localStorage.setItem('hasRevealed', '1') } catch (err) { console.warn('Could not persist reveal flag', err) }
        await fetchMyAssignment()
      } else {
        setRevealResult(null)
      }
      setRevealLoading(false)
    }, 1400)
  }

  const resetDraw = async () => {
    if (!confirm('Reset Secret Santa? This will remove all assignments and turn the draw off.')) return;
    try {
      const r = await API('/api/draw-reset', { method: 'POST' })
      if (r && r.ok) {
        setDrawExists(false)
        setHasRevealed(false)
        localStorage.removeItem('hasRevealed')
        setRevealResult(null)
        alert('Secret Santa has been reset')
      } else {
        setMsg(r && r.error ? r.error : 'Could not reset draw')
      }
    } catch (e) {
      console.error('Reset error', e)
      setMsg('Error resetting draw')
    }
  }

  if (!authed) return (
    <div className="auth-page">
      <div className="hero-area">
        <div className="hero-overlay">
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div className="christmas-badge">🎄</div>
            <div>
              <h1 className="hero-title">Family Secret Santa</h1>
              <div className="small">Make wishes — share the joy 🎁</div>
            </div>
          </div>
        </div>
      </div>

      <div className="login-panel">
        <div className="login-card">
          <h2 style={{marginTop:0}}>Login or Register</h2>
          <div className="form-row">
            <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" />
            <input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" type="password" />
          </div>
          <div className="login-actions">
            <button className="btn primary" onClick={doLogin}>Login</button>
            <button className="btn ghost" onClick={doRegister}>Register</button>
          </div>
          <div className="small" style={{marginTop:10,color:'var(--muted)'}}>{msg || 'You can use any email to register for now.'}</div>
        </div>
      </div>
      {/* Snow effect for login page */}
      <div className="snow" aria-hidden="true">
        {Array.from({length:18}).map((_,i)=>{
          const left = (i * 7) % 100;
          const dur = 8 + (i % 6);
          const size = 8 + (i % 6);
          const delay = Math.round(Math.random()*6);
          return <span key={i} className="flake" style={{left:left+'%', animationDuration:dur+'s', fontSize:size, animationDelay:delay+'s'}}>❄</span>
        })}
      </div>
    </div>
  )

  // If authenticated but not yet claimed a profile, show Who Are You? screen
  if (authed && !myClaim) return (
    <div className="auth-page">
      <div className="hero-area" />
      <div className="login-panel">
        <div className="login-card">
          <h2 style={{marginTop:0}}>Who are you?</h2>
          <div className="small" style={{marginBottom:8}}>Select your family profile to claim it.</div>
          <div className="profiles-list">
            {profiles.map(p => {
              const claimed = p.claimed_by !== null && typeof p.claimed_by !== 'undefined'
              return (
                <button key={p.id} className={`profile-btn ${claimed? 'claimed':''}`} disabled={claimed || claimLoading} onClick={async ()=>{
                  if (claimed || claimLoading) return
                  setClaimLoading(true)
                  const res = await API('/api/claim', { method: 'POST', body: JSON.stringify({ profileId: p.id }) })
                  setClaimLoading(false)
                  if (res && res.claim) {
                    setMyClaim(res.claim)
                    setProfiles([])
                    setMsg('')
                      refreshItems()
                      // fetch assignment (if the draw already ran and this profile had an assignment transferred)
                      await fetchMyAssignment()
                  } else {
                    setMsg(res && res.error ? res.error : 'Could not claim profile')
                    const latest = await API('/api/profiles')
                    if (latest && latest.profiles) setProfiles(latest.profiles)
                  }
                }}>
                  <div className="profile-name">{p.name}</div>
                  <div className="profile-meta">{claimed ? 'Taken' : 'Select'}</div>
                </button>
              )
            })}
          </div>
          <div className="small" style={{marginTop:8,color:'var(--muted)'}}>{msg}</div>
        </div>
      </div>
    </div>
  )

  // build page content without nested JSX ternaries
  let pageContent = null
  if (page === 'home') {
    const recipientHeading = !drawExists
      ? 'Secret Santa Selections Happening Soon!'
      : (hasRevealed && myAssignment ? (myAssignment.recipient_name || 'Your Recipient') : 'Ready to Pick Your Recipient?')
    let recipientPanel = null
    if (!drawExists) {
      // When draw not yet run, show helpful info including exclusions (partners/other SOs)
      const exclusions = []
      if (myClaim) {
        // cannot be assigned yourself
        if (myClaim.name) exclusions.push({label: myClaim.name, reason: 'You'})
        // partner exclusion
        if (myClaim.partner_profile_id && profiles && profiles.length) {
          const p = profiles.find(pp => pp.id === myClaim.partner_profile_id)
          if (p) exclusions.push({ label: p.name, reason: 'Partner' })
        }
      }
      recipientPanel = (
        <div>
          <div className="small">You will be able to pick soon!</div>
          {exclusions.length ? (
            <div style={{marginTop:8}}>
              <div className="small">You cannot be assigned the following:</div>
              <div className="small" style={{marginTop:6}}>
                {exclusions.map((e, idx) => <div key={idx}>{e.label} {e.reason ? `(${e.reason})` : ''}</div>)}
              </div>
            </div>
          ) : null}
        </div>
      )
    } else if (!hasRevealed) {
      recipientPanel = (
        <div>
          <div className="small">When you are ready, click below to draw your person.</div>
          <button className="btn primary" style={{marginTop:12}} onClick={handleReveal}>Draw My Person</button>
        </div>
      )
    } else if (myAssignment) {
      recipientPanel = (
        <div className="items">
          {recipientItems.map(it => (
            <div key={it.id} className="card">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div><strong dangerouslySetInnerHTML={{__html:escapeHtml(it.title)}} /></div>
                {it.link? <a className="link" href={it.link} target="_blank" rel="noreferrer">link</a>:null}
              </div>
            </div>
          ))}
        </div>
      )
    } else {
      recipientPanel = <div className="small">You have not been assigned a recipient yet.</div>
    }

    pageContent = (
      <>
        {/* Disable the big-option card when the Secret Santa draw is OFF */}
        <div className="card big-option" style={{marginTop:0, cursor: drawExists ? 'pointer' : 'default', opacity: drawExists ? 1 : 0.85}} role="button" tabIndex={0}
          onClick={drawExists ? async ()=>{
            if (!hasRevealed) { await handleReveal(); return }
            setPage('their')
            const rid = myAssignment && myAssignment.recipient_profile_id ? myAssignment.recipient_profile_id : viewingProfileId
            if (rid) { setViewingProfileId(rid); await refreshItems(rid); }
          } : undefined}
          onKeyPress={drawExists ? async (e)=>{
            if (e.key==='Enter') {
              if (!hasRevealed) { await handleReveal(); return }
              setPage('their')
              const rid = myAssignment && myAssignment.recipient_profile_id ? myAssignment.recipient_profile_id : viewingProfileId
              if (rid) { setViewingProfileId(rid); await refreshItems(rid); }
            }
          } : undefined}>
          <h3 style={{marginTop:0}}>{recipientHeading}</h3>
          {recipientPanel}
        </div>

        <div className="card big-option" style={{marginTop:12}} role="button" tabIndex={0} onClick={() => { setPage('your'); refreshItems(); }} onKeyPress={(e)=>{ if(e.key==='Enter') { setPage('your'); refreshItems(); } }}>
          <h3 style={{marginTop:0}}>View and Edit your Wishlist</h3>
          <div>
            {items.length === 0 ? (
              <div>
                <div className="small">You have no items yet.</div>
                <div className="small" style={{marginTop:8}}>Click to add items to your wishlist.</div>
              </div>
            ) : (
              <div>
                <div className="small">You have {items.length} {items.length === 1 ? 'item' : 'items'} on your wishlist.</div>
                <div className="small" style={{marginTop:8}}>Click to view and edit your wishlist.</div>
              </div>
            )}
          </div>
        </div>
      </>
    )
  } else if (page === 'your') {
    pageContent = (
      <div>
        <div className="christmas-banner">
          <div className="christmas-badge">🎅</div>
          <div>
            <h1 className="title">Your Wishlist</h1>
            <div className="small">Add your wishes — keep it fun and simple</div>
          </div>
        </div>
        <div className="card">
          <h3 style={{marginTop:0}}>Your List (editable)</h3>
          <div className="form-row grid-2">
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Gift title" />
            <input value={link} onChange={e=>setLink(e.target.value)} placeholder="Optional link (URL)" />
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',marginTop:8}}>
            <button className="btn primary" onClick={addItem}>Add Item</button>
            <button className="btn" onClick={copyWishlist}>Copy Wishlist</button>
          </div>
          <div className="small" style={{marginTop:8,color:'var(--muted)'}}>
            Copied lists are for external use. To update your wishlist, please use this site so changes are persisted.
          </div>
          <div className="items" style={{marginTop:12}}>
            {items.map(it => (
              <div key={it.id} className="card">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                  <div style={{flex:1}}><strong dangerouslySetInnerHTML={{__html:escapeHtml(it.title)}} /></div>
                  {it.link? <a className="link" href={it.link} target="_blank" rel="noreferrer">link</a>:null}
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <button className={`btn ${it.favorited_by_owner? 'primary':''}`} onClick={()=>toggleFavorite(it.id, !!it.favorited_by_owner)} style={{minWidth:72}}>{it.favorited_by_owner ? '★' : '☆'}</button>
                    <button className="btn ghost" onClick={()=>deleteItem(it.id)} style={{minWidth:72}}>Remove</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  } else {
    // their page
    let content = null
    if (!viewingProfileId) content = <div className="small">Select a profile to view their list.</div>
    else if (!drawExists) content = <div className="small">Secret Santa has not been picked yet.</div>
    else content = (
      <div className="items">
        {items.map(it => (
          <div key={it.id} className="card">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div><strong dangerouslySetInnerHTML={{__html:escapeHtml(it.title)}} /></div>
              {it.link? <a className="link" href={it.link} target="_blank" rel="noreferrer">link</a>:null}
            </div>
          </div>
        ))}
      </div>
    )
    pageContent = (
      <div className="card">
        <h3 style={{marginTop:0}}>Their List</h3>
        {content}
      </div>
    )
  }

  // preview modal content is simple mapping
  const previewModal = previewAssignments ? (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <h3>Test Raffle Preview</h3>
        <div className="small">This is a preview only and does not persist assignments.</div>
        <div style={{marginTop:12}}>
          {previewAssignments.map(p => {
            const key = p.giver_profile_id || p.giver_user_id || Math.random();
            const giverLabel = p.giver_name || p.giver_email || (p.giver_profile_id ? ('profile:'+p.giver_profile_id) : (p.giver_user_id ? ('user:'+p.giver_user_id) : 'unknown'));
            const recipientLabel = p.recipient_name || (p.recipient_profile_id ? ('profile:'+p.recipient_profile_id) : 'unknown');
            return (
              <div key={key} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid rgba(0,0,0,0.06)'}}>
                <div><strong>{giverLabel}</strong></div>
                <div>→ {recipientLabel}</div>
              </div>
            )
          })}
        </div>
        <div style={{marginTop:12, textAlign:'right'}}><button className="btn" onClick={()=>setPreviewAssignments(null)}>Close</button></div>
      </div>
    </div>
  ) : null

  // reveal modal computed content to avoid nested ternaries
  let revealContent = null
  if (revealLoading) {
    revealContent = (
      <div className="reveal-box">
        <div className="spinner" aria-hidden="true"></div>
        <div className="small" style={{marginTop:8}}>Shuffling names…</div>
      </div>
    )
  } else if (revealResult) {
    revealContent = (
      <div>
        <div className="reveal-box">
          <div style={{fontSize:20,fontWeight:700}}>{revealResult.recipient_name}</div>
        </div>
        <div style={{marginTop:12}}>
          <div className="small">Their wishlist:</div>
          {revealResult.items && revealResult.items.length ? (
            <div className="items" style={{marginTop:8}}>
              {revealResult.items.map(it => (
                <div key={it.id} className="card">
                  <div style={{display:'flex',justifyContent:'space-between'}}>
                    <div><strong dangerouslySetInnerHTML={{__html:escapeHtml(it.title)}} /></div>
                    {it.link? <a className="link" href={it.link} target="_blank" rel="noreferrer">link</a>:null}
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="small">No items listed yet.</div>}
        </div>
      </div>
    )
  } else {
    revealContent = <div className="small">No assignment available.</div>
  }

  const revealModalEl = revealModal ? (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal reveal-modal">
        <h3>{revealLoading ? 'Drawing your person...' : (revealResult ? 'Your Secret Santa Recipient' : 'No assignment')}</h3>
        {revealContent}
        <div style={{marginTop:12,textAlign:'right'}}><button className="btn" onClick={()=>{ setRevealModal(false); setRevealResult(null); setRevealLoading(false); }}>Close</button></div>
      </div>
    </div>
  ) : null

  return (
    <div className="container">
      <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:12,justifyContent:'space-between'}}>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button className={`btn ${page==='home'?'primary':''}`} onClick={()=>{ setPage('home'); }}>Home</button>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button className="btn" onClick={async ()=>{ const r = await API('/api/draw-preview?useProfiles=1'); if (r && r.preview) { setPreviewAssignments(r.preview); } else { alert('Preview failed'); } }}>Test Raffle</button>
          {currentUser && currentUser.email === 'patheinecke@gmail.com' ? (
            <button className={`btn ${drawExists ? 'ghost' : 'primary'}`} onClick={async ()=>{
              if (drawExists) {
                // Turn OFF
                await resetDraw()
              } else {
                // Turn ON
                await handleRunDraw()
              }
            }}>{drawExists ? 'Turn Secret Santa OFF' : 'Turn Secret Santa ON'}</button>
          ) : null}
          
          <button className="btn ghost" onClick={logout}>Logout</button>
        </div>
      </div>

      {pageContent}

      {previewModal}
      {revealModalEl}

      <div className="footer">Built for family use — mobile friendly.</div>
      <div className="snow" aria-hidden="true">
        <span className="flake" style={{left:'5%', animationDuration:'12s', fontSize:10}}>❄</span>
        <span className="flake" style={{left:'20%', animationDuration:'9s', fontSize:14}}>❄</span>
        <span className="flake" style={{left:'35%', animationDuration:'15s', fontSize:12}}>❄</span>
        <span className="flake" style={{left:'50%', animationDuration:'11s', fontSize:9}}>❄</span>
        <span className="flake" style={{left:'65%', animationDuration:'13s', fontSize:13}}>❄</span>
        <span className="flake" style={{left:'80%', animationDuration:'10s', fontSize:11}}>❄</span>
      </div>
    </div>
  )
}
