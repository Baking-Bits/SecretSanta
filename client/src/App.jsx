import React, { useEffect, useState } from 'react'
import { StarSolid, StarOutline, Pencil, Trash, Paperclip } from './icons'
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
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = React.useRef(null)
  const musicRef = React.useRef(null)
  const [musicPlaying, setMusicPlaying] = useState(false)
  const [musicMuted, setMusicMuted] = useState(()=>{ try { return localStorage.getItem('musicMuted') === '1' } catch(e){ return false } })
  const [musicVolume, setMusicVolume] = useState(()=>{ try { const v = localStorage.getItem('musicVolume'); return v !== null ? parseFloat(v) : 0.8 } catch(e) { return 0.8 } })

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

  // Close user menu when clicking outside
  useEffect(()=>{
    if (!userMenuOpen) return
    const onDocClick = (e) => {
      try {
        if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false)
      } catch (err) {}
    }
    document.addEventListener('click', onDocClick)
    return ()=>document.removeEventListener('click', onDocClick)
  }, [userMenuOpen])

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

  // Inline edit state for wishlist items
  const [editingItemId, setEditingItemId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editLink, setEditLink] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  const startEdit = (it) => {
    setEditingItemId(it.id)
    setEditTitle(it.title || '')
    setEditLink(it.link || '')
  }
  const cancelEdit = () => {
    setEditingItemId(null)
    setEditTitle('')
    setEditLink('')
    setEditLoading(false)
  }
  const saveEdit = async (id) => {
    try {
      setEditLoading(true)
      const res = await API('/api/wishlist/' + id, { method: 'PUT', body: JSON.stringify({ title: editTitle, link: editLink }) })
      setEditLoading(false)
      if (res && res.item) {
        // refresh local list
        await refreshItems()
        cancelEdit()
      } else {
        setMsg(res && res.error ? res.error : 'Could not save changes')
      }
    } catch (e) {
      console.error('Save edit error', e)
      setEditLoading(false)
      setMsg('Error saving item')
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

  // Share a generic reminder asking the group to add wishlist items.
  // This intentionally avoids naming the specific profile to preserve anonymity.
  const shareReminder = async (/* profileId */) => {
    try {
      const subject = `Reminder: add wishlist items for Secret Santa`
      const body = `Hi everyone,\n\nThis is a friendly reminder to add wishlist items for Secret Santa if you haven't already. Adding a few gift ideas makes it much easier for your Secret Santa to pick something you'll enjoy.\n\nOpen the app to add items: ${window.location.origin}\n\nThanks!`

      // Prefer Web Share on mobile if available
      if (navigator && navigator.share) {
        try {
          await navigator.share({ title: subject, text: body, url: window.location.origin })
          return
        } catch (e) {
          // fallthrough to copy fallback
        }
      }

      // Fallback: copy to clipboard
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(body)
        alert('Reminder copied to clipboard. Paste into your messaging app to notify the group.')
        return
      }

      // If clipboard isn't available, show the message so the user can copy it manually
      try { prompt('Reminder (copy and paste to your group chat):', body) } catch(e) { alert('Could not prepare reminder. Please manually notify the group.') }
    } catch (err) {
      console.error('shareReminder failed', err)
      alert('Could not prepare reminder. Please manually notify the group.')
    }
  }

  // Audio playback for the login page: attempts to play a supplied /login.mp3
  // and falls back to a short generated jingle if autoplay is blocked.
  const audioRef = React.useRef(null)
  function playGeneratedJingle() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.setValueAtTime(880, ctx.currentTime)
      g.gain.setValueAtTime(0.0001, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02)
      o.connect(g); g.connect(ctx.destination)
      o.start()
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.0)
      setTimeout(()=>{ try { o.stop(); ctx.close(); } catch(e){} }, 1100)
    } catch (e) {
      console.warn('WebAudio fallback failed', e)
    }
  }

  // Try to play the login audio (or fall back to the generated jingle).
  // Called on explicit user gestures (e.g. clicking the big draw card) so
  // browsers will allow playback.
  async function tryPlayAudio() {
    try {
      let el = audioRef.current || document.getElementById('login-audio')
      if (el) {
        audioRef.current = el
        el.volume = 0.8
        try {
          await el.play()
          return
        } catch (err) {
          // playback failed even after a gesture — fallback to generated tone
          try { playGeneratedJingle() } catch (e) {}
          return
        }
      }
      // no audio element available; play generated jingle
      try { playGeneratedJingle() } catch (e) {}
    } catch (e) {
      try { playGeneratedJingle() } catch (er) {}
    }
  }

  // Homepage music controls
  async function toggleMusicPlay() {
    try {
      const el = musicRef.current || document.getElementById('homepage-audio') || document.getElementById('login-audio')
      if (!el) return
      if (!musicPlaying) {
        try {
          await el.play()
          setMusicPlaying(true)
          return
        } catch (err) {
          // fallback to generated jingle if playback blocked
          try { playGeneratedJingle(); setMusicPlaying(true) } catch(e){}
        }
      } else {
        try { el.pause(); el.currentTime = 0 } catch(e){}
        setMusicPlaying(false)
      }
    } catch (e) {
      console.warn('toggleMusicPlay failed', e)
    }
  }

  function toggleMute() {
    try {
      const next = !musicMuted
      setMusicMuted(next)
      try { localStorage.setItem('musicMuted', next ? '1' : '0') } catch(e){}
      const el = musicRef.current || document.getElementById('homepage-audio') || document.getElementById('login-audio')
      if (el) el.muted = next
    } catch (e) { console.warn('toggleMute failed', e) }
  }

  function handleVolumeChange(e) {
    try {
      const v = Number(e.target.value)
      setMusicVolume(v)
      try { localStorage.setItem('musicVolume', String(v)) } catch(e){}
      const el = musicRef.current || document.getElementById('homepage-audio') || document.getElementById('login-audio')
      if (el) el.volume = v
    } catch (e) { console.warn('volume change failed', e) }
  }

  // Keep audio element properties in sync with state
  useEffect(()=>{
    const el = musicRef.current || document.getElementById('homepage-audio') || document.getElementById('login-audio')
    if (!el) return
    try { el.muted = !!musicMuted } catch(e){}
    try { el.volume = typeof musicVolume === 'number' ? musicVolume : 0.8 } catch(e){}
    const onEnded = ()=> setMusicPlaying(false)
    el.addEventListener && el.addEventListener('ended', onEnded)
    return ()=>{ try { el.removeEventListener && el.removeEventListener('ended', onEnded) } catch(e){} }
  }, [musicMuted, musicVolume])

  React.useEffect(()=>{
    // Avoid attempting to autoplay on mount (browsers will block and log errors).
    // Instead, attach a single user-gesture handler that will try to play the
    // audio element (if present) or fall back to a generated jingle.
    let handler = null
    const installHandler = () => {
      if (handler) return
      handler = async function oncePlay() {
        try {
          const el = document.getElementById('login-audio')
          if (el) {
            audioRef.current = el
            el.volume = 0.8
            try {
              await el.play()
              return
            } catch (playErr) {
              // Playback after interaction failed — fallback to generated jingle
              try { playGeneratedJingle() } catch(e){}
              return
            }
          }
          // no audio element; play generated jingle
          try { playGeneratedJingle() } catch(e){}
        } finally {
          document.removeEventListener('click', handler)
          document.removeEventListener('keydown', handler)
          document.removeEventListener('touchstart', handler)
          handler = null
        }
      }
      document.addEventListener('click', handler, { once: true })
      document.addEventListener('keydown', handler, { once: true })
      document.addEventListener('touchstart', handler, { once: true })
    }

    if (!authed) {
      try {
        installHandler()
      } catch (err) {
        // Do not spam the console from the audio setup — failures are non-critical
        console.warn('Login audio setup failed', err && (err.message || err))
      }
    } else {
      // On auth, stop any playing audio
      if (audioRef.current) {
        try { audioRef.current.pause(); audioRef.current.currentTime = 0 } catch(e){}
        audioRef.current = null
      }
    }

    return ()=>{
      try {
        if (handler) {
          try { document.removeEventListener('click', handler) } catch(e){}
          try { document.removeEventListener('keydown', handler) } catch(e){}
          try { document.removeEventListener('touchstart', handler) } catch(e){}
          handler = null
        }
      } catch(e){}
      if (audioRef.current) {
        try { audioRef.current.pause(); audioRef.current.currentTime = 0 } catch(e){}
        audioRef.current = null
      }
    }
  }, [authed])

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
    // start audio on user gesture when revealing
    try { await tryPlayAudio() } catch(e){}
    // New draw-from-hat experience:
    // 1) Ensure a draw exists (run it silently if needed)
    // 2) Fetch my assignment (but don't reveal yet)
    // 3) Build a set of face-down cards (one per profile) and animate shuffling
    // 4) Let user pick a card; reveal the assignment if they chose the right card
    try {
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

      // fetch assignment (we will reveal it only after user picks a card)
      const r = await API('/api/my-assignment')
      let assignment = null
      if (r && r.assignment) assignment = r.assignment

      // number of cards equals number of profiles minus one (you cannot pick yourself)
      let count = (profiles && profiles.length) ? Math.max(2, profiles.length - 1) : 4
      if (count < 2) count = 2
      const MAX_CARDS = 30
      if (count > MAX_CARDS) count = MAX_CARDS

      // create cards array and randomly select a target index for the real assignment
      const cards = Array.from({ length: count }).map((_, i) => ({ id: i, revealed: false }))
      const targetIndex = Math.floor(Math.random() * count)

      setDrawCards(cards)
      setShuffleActive(true)
      setPickAllowed(false)
      setPickMessage('Shuffle the cards and pick one!')

      // perform shuffling animation by reordering cards for a period
      // We'll capture the final order so we can freeze a deterministic winning card id
      let ticks = 0
      const maxTicks = 20 // shuffle for ~20 * 120ms = 2.4s
      let lastArr = null
      // clear any previous winning mapping
      setWinningCardId(null)
      setPendingAssignment({ assignment, targetIndex })
      const interval = setInterval(() => {
        // shuffle cards order in state to animate
        setDrawCards(prev => {
          const arr = prev.slice()
          for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            const tmp = arr[i]
            arr[i] = arr[j]
            arr[j] = tmp
          }
          lastArr = arr
          return arr
        })
        ticks++
        if (ticks >= maxTicks) {
          clearInterval(interval)
          // Freeze the mapping: choose the winning card id based on the
          // final shuffled order and the original targetIndex.
          try {
            const finalOrder = (lastArr || []).map(c => c.id)
            const winId = finalOrder[targetIndex] ?? finalOrder[0]
            setWinningCardId(winId)
          } catch (e) {
            console.warn('Could not determine winning card id', e)
            setWinningCardId(null)
          }
          setShuffleActive(false)
          setPickAllowed(true)
          setPickMessage('Click a card to reveal your person')
        }
      }, 120)

      setRevealLoading(false)
    } catch (err) {
      console.error('Reveal flow failed', err)
      setMsg('Could not start reveal. Please try again.')
      setRevealLoading(false)
      setRevealModal(true)
    }
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

  // Draw UI state: cards, shuffling, pending assignment info
  const [drawCards, setDrawCards] = useState(null)
  const [shuffleActive, setShuffleActive] = useState(false)
  const [pickAllowed, setPickAllowed] = useState(false)
  const [pickMessage, setPickMessage] = useState('')
  const [pendingAssignment, setPendingAssignment] = useState(null)
  const [winningCardId, setWinningCardId] = useState(null)

  const handleCardPick = async (cardId) => {
    if (!pickAllowed) return
    setPickAllowed(false)
    try {
      // Simplified UX: any card reveals your person. All cards lead to the same assignment.
      if (!pendingAssignment) {
        setMsg('No assignment available yet')
        setPickAllowed(true)
        return
      }
      // Reveal the assignment immediately
      setRevealResult(pendingAssignment.assignment)
      setHasRevealed(true)
      try { localStorage.setItem('hasRevealed', '1') } catch (err) { console.warn('Could not persist reveal flag', err) }
      // visually mark all cards as revealed so they all show the same recipient
      setDrawCards(prev => prev ? prev.map(c => Object.assign({}, c, { revealed: true })) : prev)
      // simulate that one card (someone else picking) is removed from the pool
      // after a short delay so users see the reveal first
      setTimeout(()=>{
        setDrawCards(prev => {
          if (!prev || prev.length <= 1) return prev
          // remove one card from the end to represent a taken card
          const next = prev.slice(0, prev.length - 1)
          return next
        })
      }, 900)
      await fetchMyAssignment()
      setPickMessage('You found your person!')
    } catch (err) {
      console.error('Card pick failed', err)
      setMsg('Error during pick; please try again')
      setPickAllowed(true)
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
        {/* Provide multiple audio sources so the server can serve whichever file exists */}
        <audio id="login-audio" preload="auto" aria-hidden="true">
          <source src="/Audiio_Beren_Beyond_Christmas-Tree.wav" type="audio/wav" />
          <source src="/login.mp3" type="audio/mpeg" />
        </audio>
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
                  {it.link ? (
                    <button className="btn ghost icon-link" onClick={()=>{ try { window.open(it.link, '_blank', 'noopener,noreferrer'); } catch(e){ window.location.href = it.link } }} title="Open link" aria-label="Open link">
                      <Paperclip />
                    </button>
                  ) : null}
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
            {/* Prominent homepage warning if the current user's wishlist is empty */}
            {myClaim && items && items.length === 0 ? (
              <div className="empty-warning" style={{marginTop:8, padding:10}}>
                <strong>You haven't added any wishlist items yet.</strong>
                <div style={{marginTop:6}}>Click here to add a few gift ideas so your Secret Santa knows what you'd like.</div>
              </div>
            ) : null}
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
          {items.length === 0 ? (
            <div className="empty-warning" style={{marginTop:12}}>
              <strong>You have no wishlist items yet.</strong>
              <div style={{marginTop:6}}>Please add a few gift ideas so your Secret Santa knows what you'd like — it only takes a minute.</div>
            </div>
          ) : null}
          <div className="items" style={{marginTop:12}}>
            {items.map(it => (
              <div key={it.id} className="card">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                  <div style={{flex:1}}>
                    {editingItemId === it.id ? (
                      <div style={{display:'flex',flexDirection:'column',gap:6}}>
                        <input value={editTitle} onChange={e=>setEditTitle(e.target.value)} />
                        <input value={editLink} onChange={e=>setEditLink(e.target.value)} placeholder="Optional link (URL)" />
                      </div>
                    ) : (
                      <strong dangerouslySetInnerHTML={{__html:escapeHtml(it.title)}} />
                    )}
                  </div>
                    {it.link && editingItemId !== it.id ? (
                      <button className="btn ghost icon-link" onClick={()=>{ try { window.open(it.link, '_blank', 'noopener,noreferrer'); } catch(e){ window.location.href = it.link } }} title="Open link" aria-label="Open link">
                        <Paperclip />
                      </button>
                    ) : null}
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    {editingItemId === it.id ? (
                      <>
                        <button className="btn primary" onClick={()=>saveEdit(it.id)} disabled={editLoading}>{editLoading ? 'Saving...' : 'Save'}</button>
                        <button className="btn ghost" onClick={cancelEdit}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className={`btn ${it.favorited_by_owner? 'primary':''}`} onClick={()=>toggleFavorite(it.id, !!it.favorited_by_owner)} style={{minWidth:44}} aria-label="favorite">
                          {it.favorited_by_owner ? (
                            <StarSolid />
                          ) : (
                            <StarOutline />
                          )}
                        </button>
                        <button className="btn ghost" onClick={()=>startEdit(it)} title="Edit" aria-label="edit">
                          <Pencil />
                        </button>
                        <button className="btn ghost" onClick={()=>deleteItem(it.id)} title="Delete" aria-label="delete">
                          <Trash />
                        </button>
                      </>
                    )}
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
    else if (items && items.length === 0) {
      const prof = (profiles || []).find(p => p.id === viewingProfileId)
      const profName = prof && prof.name ? prof.name : 'This person'
      content = (
        <div>
          <div className="empty-warning" style={{marginTop:8}}>
            <strong>{profName} hasn't added any wishlist items yet — shame on them.</strong>
            <div style={{marginTop:6}}>Please ask them to add a few gift ideas so their Secret Santa has something to choose.</div>
          </div>
          <div style={{marginTop:10, display:'flex', gap:8}}>
            <button className="btn primary" onClick={()=>shareReminder(viewingProfileId)}>Remind Group</button>
            <button className="btn" onClick={async ()=>{
              const body = `Hi everyone,\n\nThis is a friendly reminder to add wishlist items for Secret Santa if you haven't already. Adding a few gift ideas makes it much easier for your Secret Santa to pick something you'll enjoy.\n\nOpen the app: ${window.location.origin}\n\nThanks!`
              try {
                if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
                  await navigator.clipboard.writeText(body)
                  alert('Reminder copied to clipboard. Paste into your messaging app to notify the group.')
                } else {
                  try { prompt('Reminder (copy and paste to your group chat):', body) } catch(e) { alert('Clipboard not available; please manually notify the group.') }
                }
              } catch(e) { console.warn('copy reminder failed', e); alert('Could not copy reminder') }
            }}>Copy Reminder</button>
          </div>
        </div>
      )
    } else {
      content = (
        <div className="items">
          {items.map(it => (
            <div key={it.id} className="card">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div><strong dangerouslySetInnerHTML={{__html:escapeHtml(it.title)}} /></div>
                {it.link ? (
                  <button className="btn ghost icon-link" onClick={()=>{ try { window.open(it.link, '_blank', 'noopener,noreferrer'); } catch(e){ window.location.href = it.link } }} title="Open link" aria-label="Open link">
                    <Paperclip />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )
    }
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
                    {it.link ? (
                      <button className="btn ghost icon-link" onClick={()=>{ try { window.open(it.link, '_blank', 'noopener,noreferrer'); } catch(e){ window.location.href = it.link } }} title="Open link" aria-label="Open link">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M21.44 11.05l-8.49 8.49a5 5 0 0 1-7.07-7.07l6.36-6.36a3 3 0 0 1 4.24 4.24l-6.36 6.36a1 1 0 0 1-1.41-1.41l6.36-6.36"/></svg>
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="small">No items listed yet.</div>}
        </div>
      </div>
    )
  } else {
    // Interactive draw grid when a reveal is pending and we don't yet have a revealResult
    if (drawCards && drawCards.length) {
      revealContent = (
        <div>
          <div className="small">{pickMessage || 'Pick a card to reveal your person'}</div>
          <div className="small" style={{marginTop:6}}>Recommended gift budget: <strong>$50</strong></div>
          <div className={`draw-grid ${shuffleActive ? 'shuffling' : ''}`} style={{marginTop:12}}>
            {drawCards.map(c => (
              <div key={c.id} className={`draw-card ${c.revealed ? 'revealed' : ''} ${ (c.id === winningCardId && revealResult) ? 'flipped' : '' }`} onClick={()=>handleCardPick(c.id)} role="button" tabIndex={0}>
                <div className={`card-inner ${shuffleActive ? 'shake' : ''}`}> 
                  <div className="card-face card-back"><span className="label">?</span></div>
                  <div className="card-face card-front">
                    { (revealResult && c.id === winningCardId) ? (
                      <span>{revealResult.recipient_name}</span>
                    ) : (
                      <span className="label">🎁</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    } else {
      revealContent = <div className="small">No assignment available.</div>
    }
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
        <div style={{display:'flex',gap:8,alignItems:'center',position:'relative'}} ref={userMenuRef}>
          <button className="btn" aria-haspopup="true" aria-expanded={userMenuOpen} onClick={()=>setUserMenuOpen(v=>!v)}>
            {currentUser && (currentUser.name || currentUser.email) ? (currentUser.name || currentUser.email) : 'User'} ▾
          </button>
          {userMenuOpen ? (
            <div style={{position:'absolute',right:0,top:'calc(100% + 8px)',minWidth:220,background:'#fff',border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 6px 18px rgba(0,0,0,0.08)',borderRadius:8,zIndex:40,padding:8}}>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                <button className="btn ghost" onClick={async ()=>{ setUserMenuOpen(false); const r = await API('/api/draw-preview?useProfiles=1'); if (r && r.preview) { setPreviewAssignments(r.preview); } else { alert('Preview failed'); } }}>Test Raffle</button>
                {currentUser && currentUser.email === 'patheinecke@gmail.com' ? (
                  <button className={`btn ${drawExists ? 'ghost' : 'primary'}`} onClick={async ()=>{
                    setUserMenuOpen(false)
                    if (drawExists) {
                      await resetDraw()
                    } else {
                      await handleRunDraw()
                    }
                  }}>{drawExists ? 'Turn Secret Santa OFF' : 'Turn Secret Santa ON'}</button>
                ) : null}
                <button className="btn" onClick={()=>{ setUserMenuOpen(false); logout(); }}>Logout</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {pageContent}

      {previewModal}
      {revealModalEl}

      <div>
        <div className="footer">Built for family use — mobile friendly.</div>
        {/* Floating music cards positioned at bottom center */}
        <div className="music-card-container" aria-hidden={!authed}>
          <div className="music-card" role="region" aria-label="Music controls">
            <audio id="homepage-audio" preload="auto" ref={musicRef} loop style={{display:'none'}}>
              <source src="/Audiio_Beren_Beyond_Christmas-Tree.wav" type="audio/wav" />
              <source src="/login.mp3" type="audio/mpeg" />
            </audio>
            {/* Play / Pause button (single control) */}
            <button className="multi-btn" onClick={async ()=>{ try { await toggleMusicPlay() } catch(e){ console.warn('play/pause failed', e) } }} title={musicPlaying ? 'Pause' : 'Play'} aria-label={musicPlaying ? 'Pause music' : 'Play music'}>
              {musicPlaying ? '⏸' : '▶'}
            </button>

            <div className="volume-wrap" style={{display:'flex',alignItems:'center',gap:8}}>
              <input type="range" min="0" max="1" step="0.01" value={musicVolume} onChange={handleVolumeChange} aria-label="Music volume" />
            </div>
          </div>
        </div>
      </div>
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
