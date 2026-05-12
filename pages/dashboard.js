import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/router'

export default function Dashboard() {
  const [user, setUser]               = useState(null)
  const [loading, setLoading]         = useState(true)
  const [activeTab, setActiveTab]     = useState('roster')
  const [members, setMembers]         = useState([])
  const [deptName, setDeptName]       = useState('My Department')
  const [globalPrefix, setGlobalPrefix] = useState('1W')
  const [traineePrefix, setTraineePrefix] = useState('G')
  const [rankGroups, setRankGroups]   = useState([])
  const [subdivisions, setSubdivisions] = useState([])
  const [positions, setPositions]     = useState([])
  const [ftoList, setFtoList]         = useState([])
  const [settingsId, setSettingsId]   = useState(null)
  const [search, setSearch]           = useState('')
  const [filterRank, setFilterRank]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modal, setModal]             = useState(null)
  const [editData, setEditData]       = useState({})
  const [deletingId, setDeletingId]   = useState(null)
  const [toast, setToast]             = useState(null)
  const [saving, setSaving]           = useState(false)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUser(session.user)
      setDeptName(session.user.user_metadata?.department_name || 'My Department')
      loadAll(session.user.id)
    })
  }, [])

  async function loadAll(userId) {
    const { data: dept } = await supabase.from('departments').select('*').eq('id', userId).single()
    if (!dept) {
      await supabase.from('departments').insert({ id: userId, name: deptName, prefix: '1W', trainee_prefix: 'G' })
    } else {
      setGlobalPrefix(dept.prefix || '1W')
      setTraineePrefix(dept.trainee_prefix || 'G')
    }
    const { data: s } = await supabase.from('dept_settings').select('*').eq('dept_id', userId).single()
    if (!s) {
      const { data: ns } = await supabase.from('dept_settings').insert({ dept_id: userId, rank_groups: [], subdivisions: [], fto_list: [], positions: [] }).select().single()
      setSettingsId(ns?.id)
    } else {
      setSettingsId(s.id)
      setRankGroups(s.rank_groups || [])
      setSubdivisions(s.subdivisions || [])
      setFtoList(s.fto_list || [])
      setPositions(s.positions || [])
    }
    const { data: mems } = await supabase.from('members').select('*').eq('dept_id', userId).order('callsign_num')
    setMembers(mems || [])
    setLoading(false)
  }

  function showToast(msg, warn = false) {
    setToast({ msg, warn })
    setTimeout(() => setToast(null), 3500)
  }

  function usedSlots(groupName, excludeId = null) {
    return members.filter(m => m.rank_group === groupName && m.id !== excludeId && !m.is_trainee).map(m => m.callsign_num).filter(n => n != null)
  }
  function lowestAvailable(groupName, excludeId = null) {
    const g = rankGroups.find(r => r.name === groupName)
    if (!g) return null
    const used = usedSlots(groupName, excludeId)
    for (let n = g.from; n <= g.to; n++) { if (!used.includes(n)) return n }
    return null
  }
  function usedTraineeSlots(excludeId = null) {
    return members.filter(m => m.is_trainee && m.id !== excludeId).map(m => m.callsign_num).filter(n => n != null)
  }
  function lowestTraineeSlot(excludeId = null) {
    const used = usedTraineeSlots(excludeId)
    for (let n = 1; n <= 100; n++) { if (!used.includes(n)) return n }
    return null
  }
  function formatCS(num) { return num != null ? `${globalPrefix}-${String(num).padStart(2, '0')}` : '—' }
  function formatTCS(num) { return num != null ? `${traineePrefix}-${String(num).padStart(2, '0')}` : '—' }
  function getRGIndex(name) { return rankGroups.findIndex(g => g.name === name) }
  function subdivColor(name) { const s = subdivisions.find(s => s.name === name); return s ? s.color : '#7ec8e3' }

  async function saveMember(data) {
    if (!user) return
    setSaving(true)
    if (data.id) {
      let callsign_num = data.callsign_num
      const existing = members.find(m => m.id === data.id)
      if (existing && existing.rank_group !== data.rank_group && !data.is_trainee) {
        const slot = lowestAvailable(data.rank_group, data.id)
        if (slot === null) { showToast(`No open slots in "${data.rank_group}"`, true); setSaving(false); return }
        callsign_num = slot
      }
      const { error } = await supabase.from('members').update({ ...data, callsign_num }).eq('id', data.id)
      if (error) { showToast('Error saving member', true); setSaving(false); return }
      setMembers(prev => prev.map(m => m.id === data.id ? { ...m, ...data, callsign_num } : m))
      showToast('Member updated.')
    } else {
      const slot = data.is_trainee ? lowestTraineeSlot() : lowestAvailable(data.rank_group)
      if (slot === null) { showToast('No open slots available', true); setSaving(false); return }
      const { data: inserted, error } = await supabase.from('members').insert({ ...data, dept_id: user.id, callsign_num: slot }).select().single()
      if (error) { showToast('Error adding member', true); setSaving(false); return }
      setMembers(prev => [...prev, inserted])
      showToast(`${data.name} added as ${data.is_trainee ? formatTCS(slot) : formatCS(slot)}.`)
    }
    setModal(null)
    setSaving(false)
  }

  async function deleteMember(id) {
    await supabase.from('members').delete().eq('id', id)
    setMembers(prev => prev.filter(m => m.id !== id))
    setModal(null)
    showToast('Member removed.')
  }

  async function promoteMember(id) {
    const m = members.find(mb => mb.id === id)
    if (!m) return
    const gi = getRGIndex(m.rank_group)
    if (gi <= 0) { showToast('Already at highest rank.', true); return }
    const newGroup = rankGroups[gi - 1].name
    const slot = lowestAvailable(newGroup, id)
    if (slot === null) { showToast(`No open slots in "${newGroup}"`, true); return }
    const oldCS = formatCS(m.callsign_num)
    await supabase.from('members').update({ rank_group: newGroup, callsign_num: slot }).eq('id', id)
    setMembers(prev => prev.map(mb => mb.id === id ? { ...mb, rank_group: newGroup, callsign_num: slot } : mb))
    showToast(`${m.name} promoted to ${newGroup} -> ${formatCS(slot)} (was ${oldCS}).`)
  }

  async function demoteMember(id) {
    const m = members.find(mb => mb.id === id)
    if (!m) return
    const gi = getRGIndex(m.rank_group)
    if (gi >= rankGroups.length - 1) { showToast('Already at lowest rank.', true); return }
    const newGroup = rankGroups[gi + 1].name
    const slot = lowestAvailable(newGroup, id)
    if (slot === null) { showToast(`No open slots in "${newGroup}"`, true); return }
    const oldCS = formatCS(m.callsign_num)
    await supabase.from('members').update({ rank_group: newGroup, callsign_num: slot }).eq('id', id)
    setMembers(prev => prev.map(mb => mb.id === id ? { ...mb, rank_group: newGroup, callsign_num: slot } : mb))
    showToast(`${m.name} demoted to ${newGroup} -> ${formatCS(slot)} (was ${oldCS}).`)
  }

  async function graduateTrainee(id) {
    const t = members.find(m => m.id === id)
    if (!t) return
    if (rankGroups.length === 0) { showToast('No rank groups set up yet.', true); return }
    const lowestGroup = rankGroups[rankGroups.length - 1]
    const slot = lowestAvailable(lowestGroup.name)
    if (slot === null) { showToast(`No open slots in "${lowestGroup.name}"`, true); return }
    await supabase.from('members').update({ is_trainee: false, rank_group: lowestGroup.name, callsign_num: slot }).eq('id', id)
    setMembers(prev => prev.map(m => m.id === id ? { ...m, is_trainee: false, rank_group: lowestGroup.name, callsign_num: slot } : m))
    showToast(`${t.name} graduated -> ${formatCS(slot)} (${lowestGroup.name}).`)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  function statusPill(s) {
    const map = { Active: 'active', Inactive: 'inactive', LOA: 'loa', 'Part Time': 'parttime' }
    return <span className={`s-pill s-${map[s] || 'inactive'}`}><span className="s-dot"></span>{s}</span>
  }
  function strikesBadge(n) {
    const cls = n === 0 ? 'strikes-0' : n === 1 ? 'strikes-1' : n === 2 ? 'strikes-2' : 'strikes-3plus'
    return <span className={`strikes-badge ${cls}`}>{n}</span>
  }
  function subdivBadges(arr) {
    if (!arr || !arr.filter(Boolean).length) return <span style={{ color: 'var(--gold-dim)', fontFamily: 'JetBrains Mono,monospace', fontSize: 11 }}>—</span>
    return arr.filter(Boolean).map((s, i) => {
      const c = subdivColor(s)
      return <span key={i} className="sdiv-badge" style={{ color: c, background: c + '18', borderColor: c + '55' }}>{s}</span>
    })
  }
  function formatDate(d) {
    if (!d) return '—'
    const [y, m, day] = d.split('-')
    const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${M[parseInt(m)-1]} ${parseInt(day)}, ${y}`
  }

  const mainMembers = members.filter(m => !m.is_trainee)
  const traineeMembers = members.filter(m => m.is_trainee)
  const stats = {
    total: mainMembers.length,
    active: mainMembers.filter(m => m.status === 'Active').length,
    inactive: mainMembers.filter(m => m.status === 'Inactive').length,
    loa: mainMembers.filter(m => m.status === 'LOA').length,
    pt: mainMembers.filter(m => m.status === 'Part Time').length,
    trainees: traineeMembers.length,
  }

  function renderMainRoster() {
    if (rankGroups.length === 0) return (
      <div className="empty-state">
        <div className="ei">⚙️</div>
        <p style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, letterSpacing: 1 }}>
          No rank groups yet. Go to the <strong style={{ color: 'var(--gold)' }}>Editor</strong> tab to get started.
        </p>
      </div>
    )
    const filtered = mainMembers.filter(m => {
      const ms = !search || m.name.toLowerCase().includes(search.toLowerCase())
      const mr = !filterRank || m.rank_group === filterRank
      const mst = !filterStatus || m.status === filterStatus
      return ms && mr && mst
    })
    return rankGroups.map((g, gi) => {
      const rows = []
      for (let slot = g.from; slot <= g.to; slot++) {
        const m = filtered.find(mb => mb.rank_group === g.name && mb.callsign_num === slot)
        if (m) {
          rows.push(
            <tr key={slot} className="filled-row">
              <td><span className="cs-tag">{formatCS(m.callsign_num)}</span></td>
              <td>
                <div className="mname">{m.name}</div>
                {m.position && <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: 'var(--gold)', letterSpacing: '.5px', marginTop: 1, textTransform: 'uppercase' }}>{m.position}</div>}
              </td>
              <td><span className="fto-tag">{m.fto || '—'}</span></td>
              <td><span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: 'var(--slate)' }}>{formatDate(m.doh)}</span></td>
              <td><div className="subdiv-wrap">{subdivBadges(m.subdivs)}</div></td>
              <td>{statusPill(m.status)}</td>
              <td><span className="notes-cell" title={m.notes || ''}>{m.notes || '—'}</span></td>
              <td><span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: 'var(--slate-lt)' }}>{m.discord || '—'}</span></td>
              <td>{strikesBadge(m.strikes || 0)}</td>
              <td>
                <div className="row-actions admin-acts">
                  {gi > 0 && <button className="btn btn-promote" onClick={() => promoteMember(m.id)}>▲</button>}
                  {gi < rankGroups.length - 1 && <button className="btn btn-demote" onClick={() => demoteMember(m.id)}>▼</button>}
                  <button className="btn btn-outline btn-sm" onClick={() => { setEditData(m); setModal('edit') }}>Edit</button>
                  <button className="btn btn-danger" onClick={() => { setDeletingId(m.id); setModal('confirm-del') }}>X</button>
                </div>
              </td>
            </tr>
          )
        } else {
          rows.push(
            <tr key={slot} className="empty-row">
              <td><span className="cs-tag-empty">{formatCS(slot)}</span></td>
              <td colSpan="9" style={{ color: 'var(--gold-dim)', fontFamily: 'JetBrains Mono,monospace', fontSize: 10, letterSpacing: 1 }}>— VACANT —</td>
            </tr>
          )
        }
      }
      return (
        <div key={g.name}>
          {gi > 0 && <div className="rank-group-spacer" />}
          <div className="rank-group">
            <div className="rank-group-label-row">
              <div className="rank-group-label">{g.name}</div>
              <div className="rank-group-table-wrap">
                <table className="roster-tbl">
                  <thead>
                    <tr className="col-header-row">
                      <th>Callsign</th><th>Name</th><th>FTO</th><th>DOH</th>
                      <th>Subdivision</th><th>Status</th><th>Notes</th><th>Discord ID</th><th>Strikes</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>{rows}</tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )
    })
  }

  function renderTrainees() {
    if (traineeMembers.length === 0) return (
      <div className="empty-state"><div className="ei">🎓</div><p>No trainees enrolled.</p></div>
    )
    return (
      <div className="rank-group">
        <div className="rank-group-label-row">
          <div className="rank-group-label" style={{ background: '#2a1a4a', color: '#b39ddb', borderRightColor: '#4a2a7a' }}>Trainees</div>
          <div className="rank-group-table-wrap">
            <table className="roster-tbl">
              <thead>
                <tr className="col-header-row">
                  <th>Callsign</th><th>Name</th><th>FTO</th><th>DOH</th><th>Status</th><th>Discord ID</th><th>Notes</th><th>Strikes</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {traineeMembers.map(t => (
                  <tr key={t.id} className="filled-row">
                    <td><span className="cs-tag" style={{ color: '#b39ddb' }}>{formatTCS(t.callsign_num)}</span></td>
                    <td><div className="mname">{t.name}</div></td>
                    <td><span className="fto-tag">{t.fto || '—'}</span></td>
                    <td><span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: 'var(--slate)' }}>{formatDate(t.doh)}</span></td>
                    <td>{statusPill(t.status)}</td>
                    <td><span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: 'var(--slate-lt)' }}>{t.discord || '—'}</span></td>
                    <td><span className="notes-cell">{t.notes || '—'}</span></td>
                    <td>{strikesBadge(t.strikes || 0)}</td>
                    <td>
                      <div className="row-actions" style={{ opacity: 1 }}>
                        <button className="btn btn-graduate" onClick={() => graduateTrainee(t.id)}>Graduate</button>
                        <button className="btn btn-outline btn-sm" onClick={() => { setEditData(t); setModal('edit-trainee') }}>Edit</button>
                        <button className="btn btn-danger" onClick={() => { setDeletingId(t.id); setModal('confirm-del') }}>X</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  function MemberModal({ isTrainee, isEdit }) {
    const [form, setForm] = useState(isEdit ? { ...editData } : {
      name: '', discord: '', rank_group: rankGroups[rankGroups.length - 1]?.name || '',
      position: '', status: 'Active', doh: new Date().toISOString().split('T')[0],
      fto: '', subdivs: [], strikes: 0, volunteer: false, notes: '', is_trainee: isTrainee || false
    })
    function set(k, v) { setForm(f => ({ ...f, [k]: v })) }
    async function handleSave() {
      if (!form.name) { showToast('Name is required.', true); return }
      await saveMember(form)
    }
    const inputStyle = { width:'100%', background:'rgba(7,14,28,.7)', border:'1px solid rgba(201,168,76,.18)', color:'var(--cream)', padding:'10px 12px', fontFamily:'Source Serif 4,serif', fontSize:13, borderRadius:2, outline:'none' }
    const selectStyle = { width:'100%', background:'rgba(7,14,28,.85)', border:'1px solid rgba(201,168,76,.18)', color:'var(--cream)', padding:'10px 12px', fontFamily:'JetBrains Mono,monospace', fontSize:11, borderRadius:2, outline:'none', cursor:'pointer', appearance:'none' }
    return (
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
        <div className="modal">
          <div className="modal-title">{isEdit ? 'Edit Member' : isTrainee ? 'Add Trainee' : 'Add Member'}</div>
          <div className="modal-sub">{isEdit ? 'Update details.' : isTrainee ? `Auto-assigned ${traineePrefix}-## callsign.` : 'Auto-assigned callsign.'}</div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Full Name</label><input style={inputStyle} value={form.name||''} onChange={e=>set('name',e.target.value)} placeholder="John Smith"/></div>
            <div className="form-group"><label className="form-label">Discord ID</label><input style={inputStyle} value={form.discord||''} onChange={e=>set('discord',e.target.value)} placeholder="123456789..."/></div>
          </div>
          {!isTrainee && (
            <>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Rank Group</label>
                  <select style={selectStyle} value={form.rank_group||''} onChange={e=>set('rank_group',e.target.value)}>
                    {rankGroups.map(g=><option key={g.name} value={g.name}>{g.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Position</label>
                  <select style={selectStyle} value={form.position||''} onChange={e=>set('position',e.target.value)}>
                    <option value="">— None —</option>
                    {positions.map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group"><label className="form-label">Subdivision 1</label>
                <select style={selectStyle} value={(form.subdivs&&form.subdivs[0])||''} onChange={e=>set('subdivs',[e.target.value,form.subdivs?.[1]||'',form.subdivs?.[2]||''].filter(Boolean))}>
                  <option value="">— None —</option>
                  {subdivisions.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Subdivision 2</label>
                  <select style={selectStyle} value={(form.subdivs&&form.subdivs[1])||''} onChange={e=>set('subdivs',[form.subdivs?.[0]||'',e.target.value,form.subdivs?.[2]||''].filter(Boolean))}>
                    <option value="">— None —</option>
                    {subdivisions.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Subdivision 3</label>
                  <select style={selectStyle} value={(form.subdivs&&form.subdivs[2])||''} onChange={e=>set('subdivs',[form.subdivs?.[0]||'',form.subdivs?.[1]||'',e.target.value].filter(Boolean))}>
                    <option value="">— None —</option>
                    {subdivisions.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}
          <div className="form-row">
            <div className="form-group"><label className="form-label">Status</label>
              <select style={selectStyle} value={form.status||'Active'} onChange={e=>set('status',e.target.value)}>
                {['Active','Inactive','LOA','Part Time'].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">FTO</label>
              <select style={selectStyle} value={form.fto||''} onChange={e=>set('fto',e.target.value)}>
                <option value="">— None —</option>
                {ftoList.map(f=><option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">DOH</label><input style={inputStyle} type="date" value={form.doh||''} onChange={e=>set('doh',e.target.value)}/></div>
            <div className="form-group"><label className="form-label">Strikes</label><input style={inputStyle} type="number" min="0" max="99" value={form.strikes||0} onChange={e=>set('strikes',parseInt(e.target.value)||0)}/></div>
          </div>
          <div className="form-group"><label className="form-label">Notes</label><input style={inputStyle} value={form.notes||''} onChange={e=>set('notes',e.target.value)} placeholder="Optional..."/></div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={()=>setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?'Saving...':'Save Member'}</button>
          </div>
        </div>
      </div>
    )
  }

  function Editor() {
    const [rg, setRg]     = useState(rankGroups)
    const [sd, setSd]     = useState(subdivisions)
    const [pos, setPos]   = useState(positions)
    const [fto, setFto]   = useState(ftoList)
    const [pfx, setPfx]   = useState(globalPrefix)
    const [tpfx, setTpfx] = useState(traineePrefix)
    const [ngName, setNgName] = useState('')
    const [ngFrom, setNgFrom] = useState('')
    const [ngTo, setNgTo]     = useState('')
    const [nsdName, setNsdName]   = useState('')
    const [nsdColor, setNsdColor] = useState('#7ec8e3')
    const [nposName, setNposName] = useState('')
    const [nftoName, setNftoName] = useState('')
    const edDivider = <div style={{height:1,background:'linear-gradient(90deg,rgba(201,168,76,.2),transparent)',margin:'20px 0'}}/>
    const h3style = {fontFamily:'Bebas Neue,sans-serif',fontSize:18,letterSpacing:2,color:'var(--cream)',marginBottom:4,display:'block'}
    const notestyle = {fontFamily:'JetBrains Mono,monospace',fontSize:10,color:'var(--slate)',letterSpacing:1,marginBottom:12,lineHeight:1.6,display:'block'}

    async function applyAll() {
      setSaving(true)
      setRankGroups(rg); setSubdivisions(sd); setPositions(pos); setFtoList(fto)
      setGlobalPrefix(pfx); setTraineePrefix(tpfx)
      await supabase.from('dept_settings').update({ rank_groups: rg, subdivisions: sd, fto_list: fto, positions: pos }).eq('dept_id', user.id)
      await supabase.from('departments').update({ prefix: pfx, trainee_prefix: tpfx }).eq('id', user.id)
      setSaving(false)
      showToast('All settings saved.')
    }

    return (
      <div style={{maxWidth:700}}>
        <div className="adm-notice"><span>⬡</span><span>Build your roster from scratch. Click Save All when done.</span></div>

        <div style={{marginBottom:24}}>
          <span style={h3style}>Callsign Prefix</span>
          <span style={notestyle}>Changes all member callsigns at once.</span>
          <div style={{display:'flex',gap:12,alignItems:'flex-end',flexWrap:'wrap'}}>
            <div className="form-group" style={{marginBottom:0}}>
              <label className="form-label">Main Prefix</label>
              <input className="form-input" style={{maxWidth:120}} value={pfx} onChange={e=>setPfx(e.target.value)}/>
            </div>
            <div className="form-group" style={{marginBottom:0}}>
              <label className="form-label">Trainee Prefix</label>
              <input className="form-input" style={{maxWidth:120}} value={tpfx} onChange={e=>setTpfx(e.target.value)}/>
            </div>
            <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,color:'var(--slate-lt)',paddingBottom:2}}>
              Preview: <span style={{color:'#6ecf8a'}}>{pfx}-##</span> / <span style={{color:'#b39ddb'}}>{tpfx}-##</span>
            </span>
          </div>
        </div>
        {edDivider}

        <div style={{marginBottom:24}}>
          <span style={h3style}>Rank Groups</span>
          <span style={notestyle}>Top = highest rank. Each group has a callsign slot range.</span>
          <div style={{display:'grid',gridTemplateColumns:'1fr 70px 70px 28px 28px 28px',gap:6,padding:'0 10px 8px',fontFamily:'JetBrains Mono,monospace',fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'var(--slate)'}}>
            <span>Name</span><span>From</span><span>To</span><span></span><span></span><span></span>
          </div>
          <div className="edit-list">
            {rg.map((g,i)=>(
              <div key={i} className="edit-row" style={{gridTemplateColumns:'1fr 70px 70px 28px 28px 28px'}}>
                <input type="text" value={g.name} onChange={e=>setRg(rg.map((r,j)=>j===i?{...r,name:e.target.value}:r))}/>
                <input type="number" value={g.from} onChange={e=>setRg(rg.map((r,j)=>j===i?{...r,from:parseInt(e.target.value)||1}:r))}/>
                <input type="number" value={g.to} onChange={e=>setRg(rg.map((r,j)=>j===i?{...r,to:parseInt(e.target.value)||1}:r))}/>
                <button className="icon-btn" disabled={i===0} onClick={()=>{const a=[...rg];[a[i],a[i-1]]=[a[i-1],a[i]];setRg(a)}}>↑</button>
                <button className="icon-btn" disabled={i===rg.length-1} onClick={()=>{const a=[...rg];[a[i],a[i+1]]=[a[i+1],a[i]];setRg(a)}}>↓</button>
                <button className="del-btn" onClick={()=>setRg(rg.filter((_,j)=>j!==i))}>×</button>
              </div>
            ))}
          </div>
          <div className="add-row-form">
            <input type="text" placeholder="Group name..." value={ngName} onChange={e=>setNgName(e.target.value)}/>
            <input type="number" placeholder="From" value={ngFrom} onChange={e=>setNgFrom(e.target.value)} style={{width:80}}/>
            <input type="number" placeholder="To" value={ngTo} onChange={e=>setNgTo(e.target.value)} style={{width:80}}/>
            <button className="btn btn-primary btn-sm" onClick={()=>{if(!ngName)return;setRg([...rg,{name:ngName,from:parseInt(ngFrom)||1,to:parseInt(ngTo)||1}]);setNgName('');setNgFrom('');setNgTo('')}}>+ Add</button>
          </div>
        </div>
        {edDivider}

        <div style={{marginBottom:24}}>
          <span style={h3style}>Positions</span>
          <span style={notestyle}>Custom titles shown under member names (e.g. Director, Sergeant).</span>
          <div className="edit-list">
            {pos.map((p,i)=>(
              <div key={i} className="edit-row" style={{gridTemplateColumns:'1fr 28px'}}>
                <input type="text" value={p} onChange={e=>setPos(pos.map((v,j)=>j===i?e.target.value:v))}/>
                <button className="del-btn" onClick={()=>setPos(pos.filter((_,j)=>j!==i))}>×</button>
              </div>
            ))}
          </div>
          <div className="add-row-form">
            <input type="text" placeholder="New position title..." value={nposName} onChange={e=>setNposName(e.target.value)}/>
            <button className="btn btn-primary btn-sm" onClick={()=>{if(!nposName)return;setPos([...pos,nposName]);setNposName('')}}>+ Add</button>
          </div>
        </div>
        {edDivider}

        <div style={{marginBottom:24}}>
          <span style={h3style}>Subdivisions</span>
          <span style={notestyle}>Up to 3 per member.</span>
          <div className="edit-list">
            {sd.map((s,i)=>(
              <div key={i} className="edit-row" style={{gridTemplateColumns:'1fr 60px 28px'}}>
                <input type="text" value={s.name} onChange={e=>setSd(sd.map((v,j)=>j===i?{...v,name:e.target.value}:v))}/>
                <input type="color" value={s.color} onChange={e=>setSd(sd.map((v,j)=>j===i?{...v,color:e.target.value}:v))}/>
                <button className="del-btn" onClick={()=>setSd(sd.filter((_,j)=>j!==i))}>×</button>
              </div>
            ))}
          </div>
          <div className="add-row-form">
            <input type="text" placeholder="Subdivision name..." value={nsdName} onChange={e=>setNsdName(e.target.value)}/>
            <input type="color" value={nsdColor} onChange={e=>setNsdColor(e.target.value)} style={{width:48,height:38,border:'1px solid rgba(201,168,76,.2)',borderRadius:2,background:'transparent',cursor:'pointer',padding:2}}/>
            <button className="btn btn-primary btn-sm" onClick={()=>{if(!nsdName)return;setSd([...sd,{name:nsdName,color:nsdColor}]);setNsdName('')}}>+ Add</button>
          </div>
        </div>
        {edDivider}

        <div style={{marginBottom:24}}>
          <span style={h3style}>FTO List</span>
          <span style={notestyle}>Field Training Officers available to assign.</span>
          <div className="edit-list">
            {fto.map((f,i)=>(
              <div key={i} className="edit-row" style={{gridTemplateColumns:'1fr 28px'}}>
                <input type="text" value={f} onChange={e=>setFto(fto.map((v,j)=>j===i?e.target.value:v))}/>
                <button className="del-btn" onClick={()=>setFto(fto.filter((_,j)=>j!==i))}>×</button>
              </div>
            ))}
          </div>
          <div className="add-row-form">
            <input type="text" placeholder="FTO name..." value={nftoName} onChange={e=>setNftoName(e.target.value)}/>
            <button className="btn btn-primary btn-sm" onClick={()=>{if(!nftoName)return;setFto([...fto,nftoName]);setNftoName('')}}>+ Add</button>
          </div>
        </div>

        <div style={{marginTop:28,paddingTop:20,borderTop:'1px solid rgba(255,255,255,.06)'}}>
          <button className="btn btn-primary" onClick={applyAll} disabled={saving} style={{fontSize:13,padding:'14px 40px'}}>
            {saving?'Saving...':'Save All Changes'}
          </button>
        </div>
      </div>
    )
  }

  if (loading) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#070e1c',color:'#6e82a0',fontFamily:'JetBrains Mono,monospace',fontSize:12,letterSpacing:2}}>
      LOADING...
    </div>
  )

  return (
    <div className="page">
      <header>
        <div className="header-top">
          <div className="seal">🦅</div>
          <div className="header-title">
            <div className="dept">RosterCore — Official Division Portal</div>
            <h1>{deptName}</h1>
            <div className="sub">Personnel Management System</div>
          </div>
          <div className="header-right">
            <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:'#6e82a0',letterSpacing:1}}>{user?.email}</span>
            <button className="logout-btn" onClick={handleLogout}>Logout</button>
          </div>
        </div>
        <nav>
          {[['roster','Main Roster'],['trainees','Trainee Roster'],['editor','Editor']].map(([key,label])=>(
            <button key={key} className={`nav-tab${activeTab===key?' active':''}`} onClick={()=>setActiveTab(key)}>{label}</button>
          ))}
        </nav>
      </header>

      <main>
        {activeTab==='roster' && (
          <>
            <div className="stats-bar">
              {[['Total Members',stats.total,''],['Active',stats.active,'#6ecf8a'],['Inactive',stats.inactive,'#e57373'],['LOA',stats.loa,'#ffd166'],['Part Time',stats.pt,'#ffb347'],['Trainees',stats.trainees,'#7ec8e3']].map(([label,val,color])=>(
                <div key={label} className="stat-card">
                  <div className="stat-label">{label}</div>
                  <div className="stat-value" style={color?{color}:{}}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap',alignItems:'center'}}>
              <input style={{background:'#0e1e36',border:'1px solid rgba(201,168,76,.18)',color:'var(--cream)',padding:'8px 12px',fontFamily:'JetBrains Mono,monospace',fontSize:11,borderRadius:2,outline:'none',width:180}} placeholder="Search name..." value={search} onChange={e=>setSearch(e.target.value)}/>
              <select style={{background:'#0e1e36',border:'1px solid rgba(201,168,76,.18)',color:'var(--cream)',padding:'8px 12px',fontFamily:'JetBrains Mono,monospace',fontSize:11,borderRadius:2,outline:'none',cursor:'pointer'}} value={filterRank} onChange={e=>setFilterRank(e.target.value)}>
                <option value="">All Rank Groups</option>
                {rankGroups.map(g=><option key={g.name} value={g.name}>{g.name}</option>)}
              </select>
              <select style={{background:'#0e1e36',border:'1px solid rgba(201,168,76,.18)',color:'var(--cream)',padding:'8px 12px',fontFamily:'JetBrains Mono,monospace',fontSize:11,borderRadius:2,outline:'none',cursor:'pointer'}} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
                <option value="">All Status</option>
                {['Active','Inactive','LOA','Part Time'].map(s=><option key={s}>{s}</option>)}
              </select>
              <button className="btn btn-primary btn-sm" onClick={()=>{setEditData({});setModal('add')}}>+ Add Member</button>
            </div>
            {renderMainRoster()}
          </>
        )}

        {activeTab==='trainees' && (
          <>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:22,letterSpacing:2,color:'var(--cream)'}}>Trainee <span style={{color:'var(--gold)'}}>Roster</span></div>
              <button className="btn btn-primary btn-sm" onClick={()=>{setEditData({is_trainee:true});setModal('add-trainee')}}>+ Add Trainee</button>
            </div>
            <div style={{height:1,background:'linear-gradient(90deg,var(--gold-dim),transparent)',marginBottom:20}}/>
            {renderTrainees()}
          </>
        )}

        {activeTab==='editor' && <Editor/>}
      </main>

      {modal==='add' && <MemberModal isTrainee={false} isEdit={false}/>}
      {modal==='edit' && <MemberModal isTrainee={false} isEdit={true}/>}
      {modal==='add-trainee' && <MemberModal isTrainee={true} isEdit={false}/>}
      {modal==='edit-trainee' && <MemberModal isTrainee={true} isEdit={true}/>}
      {modal==='confirm-del' && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="modal" style={{maxWidth:360,padding:28}}>
            <div className="modal-title" style={{color:'#e57373'}}>Confirm Removal</div>
            <div className="modal-sub">This will permanently remove this member.</div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}>
              <button className="btn btn-ghost" onClick={()=>setModal(null)}>Cancel</button>
              <button style={{background:'#8b2020',color:'#fff',fontFamily:'JetBrains Mono,monospace',fontSize:11,letterSpacing:1,padding:'9px 18px',borderRadius:2,cursor:'pointer',border:'none'}} onClick={()=>deleteMember(deletingId)}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" style={toast.warn?{borderLeftColor:'#e57373'}:{}}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
