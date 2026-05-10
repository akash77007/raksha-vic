import { useState, useEffect, useCallback } from 'react'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { Home, MapPin, Settings, Star, MessageCircle } from 'lucide-react'

import { SafetyTab } from './tabs/SafetyTab'
import { ZonesTab } from './tabs/ZonesTab'
import { ChatTab } from './tabs/ChatTab'
import { SettingsTab } from './tabs/SettingsTab'
import { CreditsTab } from './tabs/CreditsTab'
import { LoginScreen } from './components/LoginScreen'
import { OnboardingScreen } from './components/OnboardingScreen'

export type RiskLevel = 'SAFE' | 'CAUTION' | 'DANGER'
export type Theme = 'light' | 'dark'
export type WeatherState = 'default' | 'rain' | 'storm' | 'clear' | 'clouds' | 'hot' | 'mist' | 'snow'

export interface WeatherData {
  rainfall_mm: number; humidity_pct: number; wind_speed_kmh: number;
  temp_c: number; condition: string; description?: string; feels_like?: number;
}
export interface RiskData {
  risk_level: RiskLevel; score: number; decision: string;
  weather: WeatherData; elevation_m: number;
  historical_risk?: boolean;
  historical_details?: { zone_name?: string; nearest_zone?: string; distance_km?: number }
  nearby_zones?: { zone_name: string; risk_type: string; distance_km: number }[]
}
export interface HelplineData {
  country: string; emergency: string; disaster: string;
  disaster_name?: string; ambulance?: string; police?: string; fire?: string;
}
export interface UserConfig {
  kids_present: boolean; elderly_present: boolean; city: string; country: string;
}
export interface GoogleUser {
  name: string; email: string; picture: string; sub: string;
}

type Tab = 'safety' | 'zones' | 'chat' | 'settings' | 'credits'

// ── Map OpenWeatherMap condition → palette key ─────────────────────
function getWeatherState(condition: string, tempC: number): WeatherState {
  const c = condition.toLowerCase()
  if (c.includes('thunderstorm'))                                        return 'storm'
  if (c.includes('snow') || c.includes('sleet') || c.includes('hail')) return 'snow'
  if (c.includes('rain') || c.includes('drizzle'))                      return 'rain'
  if (c.includes('mist') || c.includes('fog') || c.includes('haze') ||
      c.includes('smoke') || c.includes('dust') || c.includes('sand'))  return 'mist'
  if (c.includes('cloud') || c.includes('overcast'))                    return 'clouds'
  if (c.includes('clear'))                                              return tempC >= 34 ? 'hot' : 'clear'
  return 'default'
}

// ── Weather emoji for badge ────────────────────────────────────────
export function getWeatherEmoji(state: WeatherState): string {
  const emojiMap: Record<WeatherState, string> = {
    rain:    '🌧️',
    storm:   '⛈️',
    clear:   '☀️',
    clouds:  '☁️',
    hot:     '🌡️',
    mist:    '🌫️',
    snow:    '❄️',
    default: '🌤️',
  }
  return emojiMap[state] ?? '🌤️'
}

function AppInner() {
  const [tab, setTab]           = useState<Tab>('safety')
  const [theme, setTheme]       = useState<Theme>(() => (localStorage.getItem('raksha_theme') as Theme) || 'light')
  const [user, setUser]         = useState<GoogleUser | null>(null)
  const [config, setConfig]     = useState<UserConfig | null>(null)
  const [riskData, setRiskData] = useState<RiskData | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [weatherState, setWeatherState] = useState<WeatherState>('default')

  const applyDynamicColor = (score: number, currentTheme: Theme) => {
    const isDark = currentTheme === 'dark'
    // Score 0 -> Green (120), Score 10 -> Red (0)
    const h = Math.max(0, 120 - (score * 12))
    
    const pL = isDark ? 70 : 35
    const pcL = isDark ? 20 : 90
    const onPL = isDark ? 10 : 100
    const onPcL = isDark ? 90 : 10
    
    const root = document.documentElement
    root.style.setProperty('--md-primary', `hsl(${h}, 75%, ${pL}%)`)
    root.style.setProperty('--md-on-primary', `hsl(${h}, 100%, ${onPL}%)`)
    root.style.setProperty('--md-primary-container', `hsl(${h}, 80%, ${pcL}%)`)
    root.style.setProperty('--md-on-primary-container', `hsl(${h}, 100%, ${onPcL}%)`)
    
    // Subtle surface tinting
    root.style.setProperty('--md-surface', `hsl(${h}, 20%, ${isDark ? 12 : 98}%)`)
    root.style.setProperty('--md-surface-container-low', `hsl(${h}, 25%, ${isDark ? 12 : 97}%)`)
    root.style.setProperty('--md-surface-container', `hsl(${h}, 25%, ${isDark ? 15 : 95}%)`)
    root.style.setProperty('--md-surface-container-high', `hsl(${h}, 25%, ${isDark ? 18 : 93}%)`)
  }

  // Apply theme to DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('raksha_theme', theme)
    if (riskData) {
      applyDynamicColor(riskData.score, theme)
    }
  }, [theme, riskData])

  // Apply risk palette to DOM whenever risk data changes
  useEffect(() => {
    if (riskData) {
      document.documentElement.setAttribute('data-risk', riskData.risk_level.toLowerCase())
      applyDynamicColor(riskData.score, theme)
      
      if (riskData.weather) {
        const state = getWeatherState(riskData.weather.condition, riskData.weather.temp_c)
        setWeatherState(state)
      }
    }
  }, [riskData, theme])

  // Restore session
  useEffect(() => {
    const u = localStorage.getItem('raksha_user')
    const c = localStorage.getItem('raksha_config')
    if (u) setUser(JSON.parse(u))
    if (c) {
      const cfg = JSON.parse(c)
      setConfig(cfg)
      const cached = localStorage.getItem('raksha_last_data')
      if (cached) {
        const d = JSON.parse(cached)
        setRiskData(d)
        if (d.weather) {
          const state = getWeatherState(d.weather.condition, d.weather.temp_c)
          setWeatherState(state)
        }
        document.documentElement.setAttribute('data-risk', d.risk_level.toLowerCase())
        applyDynamicColor(d.score, theme)
        
        const t = localStorage.getItem('raksha_last_updated')
        if (t) setLastUpdated(new Date(t))
      }
      fetchRisk(cfg)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getRiskData = async (lat: number, lon: number, cfg: UserConfig) => {
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || '') + '/api/risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, ...cfg })
      })
      if (!res.ok) throw new Error('API error')
      const data: RiskData = await res.json()
      setRiskData(data)
      setLastUpdated(new Date())
      setError(null)
      localStorage.setItem('raksha_last_data', JSON.stringify(data))
      localStorage.setItem('raksha_last_updated', new Date().toISOString())
    } catch {
      const cached = localStorage.getItem('raksha_last_data')
      if (cached) { setRiskData(JSON.parse(cached)); setError('offline') }
      else setError('Could not connect. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  const fetchRisk = useCallback(async (cfg: UserConfig) => {
    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => getRiskData(pos.coords.latitude, pos.coords.longitude, cfg),
      ()  => getRiskData(20.5937, 78.9629, cfg)
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogin    = (u: GoogleUser) => { setUser(u); localStorage.setItem('raksha_user', JSON.stringify(u)) }
  const handleOnboard  = (cfg: UserConfig) => { setConfig(cfg); localStorage.setItem('raksha_config', JSON.stringify(cfg)); fetchRisk(cfg) }
  const handleLogout   = () => {
    ['raksha_user','raksha_config','raksha_last_data','raksha_last_updated'].forEach(k => localStorage.removeItem(k))
    setUser(null); setConfig(null); setRiskData(null); setTab('safety')
    setWeatherState('default')
    document.documentElement.removeAttribute('data-weather')
    document.documentElement.removeAttribute('data-risk')
    const root = document.documentElement
    root.style.removeProperty('--md-primary')
    root.style.removeProperty('--md-on-primary')
    root.style.removeProperty('--md-primary-container')
    root.style.removeProperty('--md-on-primary-container')
    root.style.removeProperty('--md-surface')
    root.style.removeProperty('--md-surface-container-low')
    root.style.removeProperty('--md-surface-container')
    root.style.removeProperty('--md-surface-container-high')
  }
  const handleUpdate   = (cfg: UserConfig) => { setConfig(cfg); localStorage.setItem('raksha_config', JSON.stringify(cfg)); fetchRisk(cfg) }
  const toggleTheme    = () => setTheme(t => t === 'light' ? 'dark' : 'light')

  if (!user)   return <LoginScreen onLogin={handleLogin} theme={theme} />
  if (!config) return <OnboardingScreen user={user} onComplete={handleOnboard} />

  const navItems: { id: Tab; icon: typeof Home; label: string }[] = [
    { id: 'safety',   icon: Home,            label: 'Safety'   },
    { id: 'zones',    icon: MapPin,          label: 'Zones'    },
    { id: 'chat',     icon: MessageCircle,   label: 'Chat'     },
    { id: 'settings', icon: Settings,        label: 'Settings' },
    { id: 'credits',  icon: Star,            label: 'Credits'  },
  ]

  const weatherEmoji  = getWeatherEmoji(weatherState)
  const weatherLabel  = riskData?.weather?.condition
    ? `${weatherEmoji} ${riskData.weather.condition}`
    : null

  return (
    <div className="app-shell">
      {/* Top app bar */}
      <header className="md-top-bar">
        <span className="md-title-large" style={{ flex: 1, fontWeight: 500 }}>Raksha</span>
        {weatherLabel && (
          <span className="weather-badge" style={{ marginRight: 8 }}>
            {weatherLabel}
          </span>
        )}
        {error === 'offline' && (
          <span className="md-chip md-chip-assist md-label-small" style={{ marginRight: 8 }}>Offline</span>
        )}
        <button 
          onClick={() => setTab('settings')}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', outline: 'none', display: 'flex' }}
          aria-label="Account Settings"
        >
          {user.picture
            ? <img src={user.picture} alt={user.name} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
            : <div className="md-avatar" style={{ width: 36, height: 36, fontSize: 14 }}>{user.name?.[0]}</div>
          }
        </button>
      </header>

      {/* Tab content */}
      <main className="tab-content">
        {tab === 'safety'   && <SafetyTab config={config} riskData={riskData} loading={loading} error={error} lastUpdated={lastUpdated} onRefresh={() => fetchRisk(config)} />}
        {tab === 'zones'    && <ZonesTab riskData={riskData} config={config} />}
        {tab === 'chat'     && <ChatTab />}
        {tab === 'settings' && <SettingsTab user={user} config={config} theme={theme} onUpdate={handleUpdate} onLogout={handleLogout} onToggleTheme={toggleTheme} />}
        {tab === 'credits'  && <CreditsTab />}
      </main>

      {/* Bottom nav */}
      <nav className="md-nav-bar">
        {navItems.map(({ id, icon: Icon, label }) => (
          <button key={id} className={`md-nav-item ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            <div className="md-nav-indicator">
              <Icon size={22} strokeWidth={tab === id ? 2.5 : 1.8} />
            </div>
            <span className="md-nav-label">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || ''}>
      <AppInner />
    </GoogleOAuthProvider>
  )
}
