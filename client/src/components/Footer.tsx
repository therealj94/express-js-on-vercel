import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="border-t border-border bg-bg-soft">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <img src="/logo.jpg" alt="MyTokenPay" className="h-8 w-auto rounded-md" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              El directorio de comercios afiliados del Sistema Financiero Social. Encuentra dónde
              pagar con ORIGEN, o afilia tu negocio para aceptarlo.
            </p>
          </div>

          <div>
            <h4 className="font-display text-sm font-semibold text-text">Explorar</h4>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">
              <li><Link to="/explorar" className="hover:text-text">Directorio de negocios</Link></li>
              <li><Link to="/explorar?view=map" className="hover:text-text">Mapa</Link></li>
              <li><a href="/#categorias" className="hover:text-text">Categorías</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display text-sm font-semibold text-text">Negocios</h4>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">
              <li><Link to="/registro?tipo=negocio" className="hover:text-text">Afiliar mi negocio</Link></li>
              <li><a href="/#como-funciona" className="hover:text-text">Cómo funciona</a></li>
              <li><Link to="/iniciar-sesion" className="hover:text-text">Iniciar sesión</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display text-sm font-semibold text-text">Ecosistema SFS</h4>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">
              <li>Orden Global · Blockchain L1</li>
              <li>DBNX · Genesis ID</li>
              <li>AuCorp · Ordenex &amp; AuBank</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-2 sm:flex-row">
          <p>© {new Date().getFullYear()} MyTokenPay. Capa de comercio del Sistema Financiero Social.</p>
          <p>Hecho para Honduras, Guatemala, El Salvador, Nicaragua, Costa Rica y Panamá.</p>
        </div>
      </div>
    </footer>
  )
}
