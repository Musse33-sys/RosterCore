import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [deptName, setDeptName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleRegister(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { department_name: deptName } }
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div style={{width:70,height:70,borderRadius:'50%',background:'radial-gradient(circle, #c9a84c 0%, #6b561f 55%, #2e1e08 100%)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,margin:'0 auto 20px',boxShadow:'0 0 0 3px #6b561f'}}>🦅</div>
        <div className="auth-title">Create Account</div>
        <div className="auth-sub">Set up your department roster</div>
        {error && <div className="auth-error" style={{marginBottom:16}}>{error}</div>}
        <form onSubmit={handleRegister} style={{display:'flex',flexDirection:'column',gap:14}}>
          <div className="form-group">
            <label className="form-label">Department Name</label>
            <input className="form-input" type="text" placeholder="San Andreas Game Warden" value={deptName} onChange={e=>setDeptName(e.target.value)} required/>
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} required/>
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="Min 6 characters" value={password} onChange={e=>setPassword(e.target.value)} required/>
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{width:'100%',padding:14,fontSize:12,letterSpacing:2}}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
        <div className="auth-link" style={{marginTop:16}}>
          Already have an account? <Link href="/login">Sign in</Link>
        </div>
      </div>
    </div>
  )
}
