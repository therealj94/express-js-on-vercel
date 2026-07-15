import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, LogOut, Menu, X } from 'lucide-react'
import { useAuthStore } from '../store/auth'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium transition-colors ${isActive ? 'text-text' : 'text-muted hover:text-text'}`

export function Navbar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-bg/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <img src="/logo.jpg" alt="MyTokenPay" className="h-8 w-auto rounded-md" />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          <NavLink to="/explorar" className={navLinkClass}>
            Explorar
          </NavLink>
          <NavLink to="/explorar?view=map" className={navLinkClass}>
            Mapa
          </NavLink>
          <a href="/#como-funciona" className="text-sm font-medium text-muted transition-colors hover:text-text">
            Cómo funciona
          </a>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <>
              <Link to="/panel" className="btn-ghost !py-2 !px-4 text-sm">
                <LayoutDashboard size={16} />
                Mi panel
              </Link>
              <button
                onClick={() => {
                  logout()
                  navigate('/')
                }}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-muted transition-colors hover:text-text"
              >
                <LogOut size={16} />
                Salir
              </button>
            </>
          ) : (
            <>
              <Link to="/iniciar-sesion" className="btn-ghost !py-2 !px-4 text-sm">
                Iniciar sesión
              </Link>
              <Link to="/registro?tipo=negocio" className="btn-primary !py-2 !px-4 text-sm">
                Registrar mi negocio
              </Link>
            </>
          )}
        </div>

        <button
          className="flex items-center justify-center rounded-lg border border-border p-2 text-text md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Abrir menú"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-bg-soft px-5 py-4 md:hidden">
          <div className="flex flex-col gap-3">
            <NavLink to="/explorar" className={navLinkClass} onClick={() => setOpen(false)}>
              Explorar
            </NavLink>
            <a href="/#como-funciona" className="text-sm font-medium text-muted" onClick={() => setOpen(false)}>
              Cómo funciona
            </a>
            {user ? (
              <>
                <Link to="/panel" className="btn-ghost justify-start text-sm" onClick={() => setOpen(false)}>
                  Mi panel
                </Link>
                <button
                  onClick={() => {
                    logout()
                    setOpen(false)
                    navigate('/')
                  }}
                  className="text-left text-sm font-semibold text-muted"
                >
                  Cerrar sesión
                </button>
              </>
            ) : (
              <>
                <Link to="/iniciar-sesion" className="btn-ghost justify-start text-sm" onClick={() => setOpen(false)}>
                  Iniciar sesión
                </Link>
                <Link
                  to="/registro?tipo=negocio"
                  className="btn-primary justify-start text-sm"
                  onClick={() => setOpen(false)}
                >
                  Registrar mi negocio
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
