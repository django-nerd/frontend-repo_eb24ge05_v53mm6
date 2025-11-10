import { useEffect, useRef, useState } from 'react'

function App() {
  const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

  const [mode, setMode] = useState('login') // 'login' | 'signup' | 'app'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState(null)

  const [uploading, setUploading] = useState(false)
  const [meals, setMeals] = useState([])
  const [message, setMessage] = useState('')

  const fileInputRef = useRef(null)

  useEffect(() => {
    const saved = localStorage.getItem('cv_user')
    if (saved) {
      const u = JSON.parse(saved)
      setUser(u)
      setMode('app')
      fetchMeals(u.user_id)
    }
  }, [])

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
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || 'Failed to sign up')
        }
        // After signup, log in automatically
      }

      const res2 = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res2.ok) {
        const err = await res2.json().catch(() => ({}))
        throw new Error(err.detail || 'Login failed')
      }
      const data = await res2.json()
      setUser(data)
      localStorage.setItem('cv_user', JSON.stringify(data))
      setMode('app')
      setPassword('')
      fetchMeals(data.user_id)
    } catch (err) {
      setMessage(err.message)
    }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('cv_user')
    setMode('login')
    setMeals([])
  }

  const onUploadClick = () => {
    if (fileInputRef.current) fileInputRef.current.click()
  }

  const onFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    await analyzeImage(file)
    // reset input for consecutive picks
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
      setMeals((prev) => [{
        _id: result.meal_id,
        dish_name: result.dish_name,
        calories: result.calories,
        macros: result.macros,
        ingredients: result.ingredients,
      }, ...prev])
      setMessage('Analysis complete')
    } catch (err) {
      setMessage(err.message)
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
          {user && (
            <button onClick={logout} className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">Logout</button>
          )}
        </div>

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
              {message && <p className="text-sm text-red-600">{message}</p>}
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
              {message && <p className="mt-3 text-sm text-gray-600">{message}</p>}
            </div>

            <div className="bg-white rounded-2xl shadow p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Your recent meals</h3>
              {meals.length === 0 ? (
                <p className="text-sm text-gray-500">No meals yet. Start by taking a photo.</p>
              ) : (
                <div className="space-y-3">
                  {meals.map((m) => (
                    <div key={m._id || Math.random()} className="flex items-center justify-between border border-gray-100 rounded-xl p-3">
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
                    </div>
                  ))}
                </div>
              )}
            </div>

            <a href="/test" className="block text-center text-xs text-gray-400 hover:text-gray-600">Debug status</a>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
