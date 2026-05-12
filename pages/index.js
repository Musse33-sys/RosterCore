import Link from 'next/link'

export default function Home() {
  return (
    <div className="landing">
      <div className="landing-hero">
        <h1>Roster<span>Core</span></h1>
        <p>Professional roster management for FiveM roleplay departments. Built for serious servers.</p>
        <div className="landing-btns">
          <Link href="/register">
            <button className="btn btn-primary" style={{fontSize:'13px',padding:'14px 32px'}}>Get Started — Free</button>
          </Link>
          <Link href="/login">
            <button className="btn btn-outline" style={{fontSize:'13px',padding:'14px 32px'}}>Login</button>
          </Link>
        </div>
      </div>
      <div className="features">
        <div className="feature-card">
          <div className="feature-icon">🦅</div>
          <div className="feature-title">Auto Callsigns</div>
          <div className="feature-desc">Callsigns assign automatically based on rank group slots. Promote someone and their callsign updates instantly.</div>
        </div>
        <div className="feature-card">
          <div className="feature-icon">⬡</div>
          <div className="feature-title">Full Editor</div>
          <div className="feature-desc">Customize rank groups, positions, subdivisions, FTO lists, themes and colors — all from one editor.</div>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🎓</div>
          <div className="feature-title">Trainee Roster</div>
          <div className="feature-desc">Separate trainee tab with G-## callsigns. Graduate trainees directly onto the main roster with one click.</div>
        </div>
        <div className="feature-card">
          <div className="feature-icon">💾</div>
          <div className="feature-title">Saved Forever</div>
          <div className="feature-desc">All your roster data saves to the cloud. No more resetting on refresh — your data is always there.</div>
        </div>
      </div>
    </div>
  )
}