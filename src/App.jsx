import { useEffect, useRef, useState } from 'react'

function MacroBar({ label, value, color }) {
  const pct = Math.max(0, Math.min(100, (Number(value || 0) / 100) * 100))
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{label}</span>
        <span>{value ?? '—'}g</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-2 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function IngredientChips({ items }) {
  if (!items || !Array.isArray(items) || items.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {items.map((it, i) => (
        <span key={i} className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700">{it}</span>
      ))}
    </div>
  )
}

function App() {
  // Backend URL resolution with storage override and HTTPS-safe default
  const STORED_URL = typeof window !== 'undefined' ? localStorage.getItem('cv_backend_url') : null
  const ENV_URL = import.meta.env.VITE_BACKEND_URL
  const DEFAULT_URL = 'https://ta-01k9qmnkhg6nmxz9yh6b76hrje-8000.wo-vegsibht7ip3wtc6l08w8melx.w.modal.host'
  const BASE_URL = (STORED_URL || ENV_URL || DEFAULT_URL)
  const isInsecure = BASE_URL?.startsWith('http://')

  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState(null)

  const [uploading, setUploading] = useState(false)
  const [meals, setMeals] = useState([])
  const [message, setMessage] = useState('')
  const [showDetail, setShowDetail] = useState(false)
  const [detailMeal, setDetailMeal] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [backendUrlDraft, setBackendUrlDraft] = useState(BASE_URL)
  const [apiStatus, setApiStatus] = useState(null) // null | 'ok' | 'fail'
  const [apiStatusText, setApiStatusText] = useState('')

  const fileInputRef = useRef(null)

  useEffect(() => {
    // Quick ping to /test to surface connectivity/CORS issues early
    const ping = async () => {
      try {
        const res = await fetch(`${BASE_URL}/test`, { method: 'GET' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        await res.json()
        setApiStatus('ok')
        setApiStatusText('Connected')
      } catch (e) {
        setApiStatus('fail')
        setApiStatusText((e?.message || 'Failed to reach backend'))
      }
    }
    ping()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('cv_user')
    if (saved) {
      const u = JSON.parse(saved)
      setUser(u)
      setMode('app')
      const cached = localStorage.getItem(`cv_meals_${u.user_id}`)
      if (cached) {
        try { setMeals(JSON.parse(cached)) } catch {}
      }
      fetchMeals(u.user_id)
    }
  }, [])

  useEffect(() => {
    if (user) {
      localStorage.setItem(`cv_meals_${user.user_id}`, JSON.stringify(meals))
    }
  }, [meals, user])

  const handleAuth = async (e) => {
    e.preventDefault()
    setMessage('')
    try {
      if (mode === 'signup') {
        const res = await fetch(`${BASE_URL}/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password }),
        })
        if (!res.ok) {
          let errText = ''
          try { errText = await res.text() } catch {}
          throw new Error(errText || 'Signup failed')
        }
      }

      const res2 = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res2.ok) {
        let errText = ''
        try { errText = await res2.text() } catch {}
        throw new Error(errText || 'Login failed')
      }
      const data = await res2.json()
      setUser(data)
      localStorage.setItem('cv_user', JSON.stringify(data))
      setMode('app')
      setPassword('')
      const cached = localStorage.getItem(`cv_meals_${data.user_id}`)
      if (cached) {
        try { setMeals(JSON.parse(cached)) } catch {}
      }
      fetchMeals(data.user_id)
    } catch (err) {
      const hint = isInsecure ? ' (Your backend URL starts with http:// which most browsers block from an https page.)' : ''
      setMessage((err?.message || 'Network error') + hint)
    }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('cv_user')
    setMode('login')
    setMeals([])
    setDetailMeal(null)
    setShowDetail(false)
  }

  const onUploadClick = () => {
    if (fileInputRef.current) fileInputRef.current.click()
  }

  const onFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    await analyzeImage(file)
    e.target.value = ''
  }

  const analyzeImage = async (file) => {
    if (!user) {
      setMessage('Please log in first')
      return
    }
    setUploading(true)
    setMessage('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('user_id', user.user_id)

      const res = await fetch(`${BASE_URL}/analyze`, { method: 'POST', body: form })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to analyze image')
      }
      const result = await res.json()

      const newMeal = {
        _id: result.meal_id,
        dish_name: result.dish_name,
        calories: result.calories,
        macros: result.macros,
        ingredients: result.ingredients,
      }
      setMeals((prev) => [newMeal, ...prev])
      localStorage.setItem('cv_last_analysis', JSON.stringify(newMeal))
      setDetailMeal(newMeal)
      setShowDetail(true)
      setMessage('')
    } catch (err) {
      const hint = isInsecure ? ' (Your backend URL starts with http:// which most browsers block from an https page.)' : ''
      setMessage((err?.message || 'Network error') + hint)
    } finally {
      setUploading(false)
    }
  }

  const fetchMeals = async (uid) => {
    try {
      const res = await fetch(`${BASE_URL}/meals?user_id=${encodeURIComponent(uid)}&limit=20`)
      if (res.ok) {
        const data = await res.json()
        setMeals(data)
      }
    } catch (err) {
      // ignore
    }
  }

  const openDetail = (meal) => {
    setDetailMeal(meal)
    setShowDetail(true)
  }

  const closeDetail = () => {
    setShowDetail(false)
    setDetailMeal(null)
  }

  const saveBackendUrl = () => {
    try {
      const trimmed = (backendUrlDraft || '').trim()
      if (!trimmed) return
      localStorage.setItem('cv_backend_url', trimmed)
      window.location.reload()
    } catch {}
  }

  const testApiNow = async () => {
    setApiStatus(null)
    setApiStatusText('')
    try {
      const res = await fetch(`${BASE_URL}/test`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await res.json()
      setApiStatus('ok')
      setApiStatusText('Connected')
    } catch (e) {
      setApiStatus('fail')
      setApiStatusText(e?.message || 'Failed to reach backend')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center">
      <div className="w-full max-w-md p-6">
        {/* Header */}
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center space-x-2">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold">CV</div>
            <div>
              <h1 className="text-xl font-semibold text-gray-800">Calorie Vision</h1>
              <p className="text-xs text-gray-500">Snap your meal. Know your calories.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSettings(true)} className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">Settings</button>
            {user && (
              <button onClick={logout} className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">Logout</button>
            )}
          </div>
        </div>

        {apiStatus === 'fail' && (
          <div className="mb-3 text-xs rounded-lg p-3 border border-amber-300 bg-amber-50 text-amber-800">
            Can't reach the API at <span className="font-mono">{BASE_URL}</span> — {apiStatusText}. {isInsecure ? 'Tip: Use https:// not http:// for the backend URL.' : ''}
          </div>
        )}

        {/* Auth */}
        {mode !== 'app' && (
          <div className="bg-white rounded-2xl shadow p-6">
            <div className="flex mb-4 bg-gray-100 rounded-lg p-1">
              <button onClick={() => setMode('login')} className={`flex-1 py-2 rounded-md text-sm font-medium ${mode==='login'?'bg-white shadow text-gray-900':'text-gray-500'}`}>Login</button>
              <button onClick={() => setMode('signup')} className={`flex-1 py-2 rounded-md text-sm font-medium ${mode==='signup'?'bg-white shadow text-gray-900':'text-gray-500'}`}>Sign up</button>
            </div>
            <form onSubmit={handleAuth} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Name</label>
                  <input value={name} onChange={(e)=>setName(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Your name" required />
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Email</label>
                <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="you@example.com" required />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Password</label>
                <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="••••••••" required />
              </div>
              {message && <p className="text-sm text-red-600 break-words">{message}</p>}
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition">{mode==='login'?'Login':'Create account'}</button>
            </form>
          </div>
        )}

        {/* Main App */}
        {mode === 'app' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">New analysis</h2>
                  <p className="text-xs text-gray-500">Take a photo of your meal to estimate calories</p>
                </div>
                <button onClick={onUploadClick} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-60" disabled={uploading}>{uploading? 'Analyzing...' : 'Take photo'}</button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileChange} />
              {message && <p className="mt-3 text-sm text-gray-600 break-words">{message}</p>}
            </div>

            <div className="bg-white rounded-2xl shadow p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Your recent meals</h3>
              {meals.length === 0 ? (
                <p className="text-sm text-gray-500">No meals yet. Start by taking a photo.</p>
              ) : (
                <div className="space-y-3">
                  {meals.map((m, idx) => (
                    <button key={m._id || `${idx}`} onClick={() => openDetail(m)} className="w-full text-left flex items-center justify-between border border-gray-100 rounded-xl p-3 hover:bg-gray-50">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{m.dish_name || 'Meal'}</p>
                        {m.ingredients && (
                          <p className="text-xs text-gray-500 truncate max-w-[220px]">{Array.isArray(m.ingredients) ? m.ingredients.join(', ') : ''}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-base font-semibold text-gray-900">{m.calories ? Math.round(m.calories) : '—'} kcal</p>
                        {m.macros && (
                          <p className="text-xs text-gray-500">C {m.macros.carbs_g ?? '—'} • P {m.macros.protein_g ?? '—'} • F {m.macros.fat_g ?? '—'}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <a href="/test" className="block text-center text-xs text-gray-400 hover:text-gray-600">Debug status</a>
          </div>
        )}
      </div>

      {/* Detail Bottom Sheet */}
      {showDetail && detailMeal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeDetail} />
          <div className="relative w-full max-w-md bg-white rounded-t-3xl p-6 animate-slide-up shadow-xl">
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-lg font-semibold text-gray-900">{detailMeal.dish_name || 'Meal details'}</h4>
              <button onClick={closeDetail} className="text-gray-400 hover:text-gray-600 text-sm">Close</button>
            </div>
            <p className="text-4xl font-bold text-gray-900 mb-4">{detailMeal.calories ? Math.round(detailMeal.calories) : '—'}<span className="text-base font-medium text-gray-500 ml-1">kcal</span></p>

            {detailMeal.macros && (
              <div className="mb-4">
                <MacroBar label="Carbs" value={detailMeal.macros.carbs_g} color="bg-blue-500" />
                <MacroBar label="Protein" value={detailMeal.macros.protein_g} color="bg-green-500" />
                <MacroBar label="Fat" value={detailMeal.macros.fat_g} color="bg-amber-500" />
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-gray-800">Ingredients</p>
              <IngredientChips items={detailMeal.ingredients} />
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSettings(false)} />
          <div className="relative w-full max-w-md bg-white rounded-2xl p-6 shadow-xl">
            <h4 className="text-lg font-semibold text-gray-900 mb-2">Settings</h4>
            <label className="block text-sm text-gray-600 mb-1">Backend URL</label>
            <input value={backendUrlDraft} onChange={(e)=>setBackendUrlDraft(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://your-backend" />
            <p className="text-xs text-gray-500 mt-2">Current: <span className="font-mono">{BASE_URL}</span></p>
            {isInsecure && (
              <p className="text-xs text-red-600 mt-1">This URL uses http:// which is blocked by browsers on a secure page. Change to https://</p>
            )}
            <div className="flex items-center justify-between mt-3">
              <button onClick={testApiNow} className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">Test API</button>
              {apiStatus && (
                <span className={`text-xs ${apiStatus==='ok'?'text-green-600':'text-amber-700'}`}>{apiStatus==='ok'?'API reachable':'API unreachable'}{apiStatusText?`: ${apiStatusText}`:''}</span>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={()=>setShowSettings(false)} className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">Close</button>
              <button onClick={saveBackendUrl} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white">Save</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slide-up { from { transform: translateY(20px); opacity: .5 } to { transform: translateY(0); opacity: 1 } }
        .animate-slide-up { animation: slide-up .22s ease-out } 
      `}</style>
    </div>
  )
}

export default App
