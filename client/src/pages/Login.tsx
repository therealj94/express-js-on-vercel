import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Compass, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { AuthShowcase } from '../components/AuthShowcase'

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, error, clearError } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    clearError()
    setSubmitting(true)
    try {
      await login(email, password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from ?? '/panel')
    } catch {
      // error already set in the store
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-dvh bg-app-gradient lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-20">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto w-full max-w-sm"
        >
          <Link to="/" className="inline-block">
            <img src="/logo.jpg" alt="MyTokenPay" className="h-8 w-auto rounded-md" />
          </Link>

          <h1 className="mt-10 font-display text-2xl font-bold sm:text-3xl">Bienvenido de nuevo</h1>
          <p className="mt-2 text-sm text-muted">Inicia sesión para administrar tu negocio afiliado.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-2">Correo</label>
              <div className="relative mt-2">
                <Mail size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tucorreo@empresa.com"
                  className="input-field !pl-10 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-2">Contraseña</label>
              <div className="relative mt-2">
                <Lock size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-field !pl-10 !pr-10 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-2"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}

            <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-60">
              {submitting ? 'Ingresando…' : 'Iniciar sesión'}
              <ArrowRight size={16} />
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            ¿No tienes cuenta?{' '}
            <Link to="/registro" className="font-semibold text-text hover:text-blue">
              Regístrate
            </Link>
          </p>

          <Link
            to="/explorar"
            className="mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-sm font-semibold text-muted hover:text-text"
          >
            <Compass size={15} />
            Continuar como invitado
          </Link>
        </motion.div>
      </div>

      <AuthShowcase
        title="Cientos de negocios ya aceptan ORIGEN"
        subtitle="Únete a la red de comercios afiliados y llega a nuevos clientes en toda la región."
      />
    </div>
  )
}
