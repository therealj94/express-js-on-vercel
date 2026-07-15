import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { SplashScreen } from './components/SplashScreen'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { useAuthStore } from './store/auth'
import { useMetaStore } from './store/meta'
import { Landing } from './pages/Landing'
import { Explore } from './pages/Explore'
import { CompanyDetail } from './pages/CompanyDetail'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { Dashboard } from './pages/Dashboard'
import { RegisterCompany } from './pages/RegisterCompany'
import { EditCompany } from './pages/EditCompany'
import { NotFound } from './pages/NotFound'

const SPLASH_KEY = 'mtp_splash_shown'

function App() {
  const [showSplash, setShowSplash] = useState(() => sessionStorage.getItem(SPLASH_KEY) !== '1')
  const init = useAuthStore((s) => s.init)
  const loadMeta = useMetaStore((s) => s.load)

  useEffect(() => {
    init()
    loadMeta()
  }, [init, loadMeta])

  if (showSplash) {
    return (
      <SplashScreen
        onDone={() => {
          sessionStorage.setItem(SPLASH_KEY, '1')
          setShowSplash(false)
        }}
      />
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Layout><Landing /></Layout>} />
      <Route path="/explorar" element={<Layout><Explore /></Layout>} />
      <Route path="/negocio/:id" element={<Layout><CompanyDetail /></Layout>} />
      <Route path="/iniciar-sesion" element={<Login />} />
      <Route path="/registro" element={<Signup />} />
      <Route
        path="/panel"
        element={
          <Layout>
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          </Layout>
        }
      />
      <Route
        path="/panel/registrar-empresa"
        element={
          <Layout>
            <ProtectedRoute>
              <RegisterCompany />
            </ProtectedRoute>
          </Layout>
        }
      />
      <Route
        path="/panel/mi-empresa"
        element={
          <Layout>
            <ProtectedRoute>
              <EditCompany />
            </ProtectedRoute>
          </Layout>
        }
      />
      <Route path="*" element={<Layout><NotFound /></Layout>} />
    </Routes>
  )
}

export default App
