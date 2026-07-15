import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, MapPinned, Search, ShieldCheck, Sparkle, Store, Users } from 'lucide-react'
import { api } from '../lib/api'
import type { Company } from '../types'
import { useMetaStore } from '../store/meta'
import { CategoryIcon } from '../components/CategoryIcon'
import { CompanyCard } from '../components/CompanyCard'
import { MapView } from '../components/MapView'

const STEPS = [
  {
    n: '01',
    title: 'Regístrate y verifica',
    body: 'Crea tu cuenta y completa el registro KYC/KYB de tu empresa: datos legales, rubro y comprobantes.',
    icon: ShieldCheck,
  },
  {
    n: '02',
    title: 'Completa tu perfil',
    body: 'Sube tu logo, fotos, servicios o productos, redes sociales y marca tu ubicación exacta en el mapa.',
    icon: Store,
  },
  {
    n: '03',
    title: 'Aparece en el directorio',
    body: 'Tu negocio queda visible por país, ciudad y categoría para toda la comunidad del ecosistema.',
    icon: MapPinned,
  },
  {
    n: '04',
    title: 'Recibe nuevos clientes',
    body: 'Miles de usuarios que reciben rendimiento en ORIGEN buscan dónde gastarlo. Que te encuentren.',
    icon: Users,
  },
]

export function Landing() {
  const navigate = useNavigate()
  const { categories, load } = useMetaStore()
  const [companies, setCompanies] = useState<Company[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    load()
    api.listCompanies({}).then(({ companies }) => setCompanies(companies)).catch(() => {})
  }, [load])

  const verifiedCount = companies.filter((c) => c.verified).length
  const countriesCovered = useMemo(() => new Set(companies.map((c) => c.countrySlug)).size, [companies])
  const featured = companies.filter((c) => c.verified).slice(0, 6)

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    navigate(query ? `/explorar?q=${encodeURIComponent(query)}` : '/explorar')
  }

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden px-5 pb-16 pt-16 sm:px-8 sm:pt-24">
        <div className="pointer-events-none absolute -top-32 right-0 h-96 w-96 rounded-full bg-violet opacity-20 blur-[120px]" />
        <div className="pointer-events-none absolute -left-20 top-40 h-72 w-72 rounded-full bg-cyan opacity-10 blur-[110px]" />

        <div className="relative mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto max-w-3xl text-center"
          >
            <span className="chip mx-auto">
              <Sparkle size={12} />
              Capa de comercio del Sistema Financiero Social
            </span>
            <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              Encuentra dónde pagar con{' '}
              <span className="text-gradient">ORIGEN</span>, o afilia tu negocio
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              El directorio público de comercios afiliados en Honduras, Guatemala, El Salvador,
              Nicaragua, Costa Rica y Panamá. Regístrate, verifica tu empresa y aparece frente a
              miles de usuarios del ecosistema.
            </p>

            <form onSubmit={submitSearch} className="mx-auto mt-8 flex max-w-lg gap-2">
              <div className="relative flex-1">
                <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-2" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Restaurantes, hoteles, gimnasios…"
                  className="input-field !pl-11"
                />
              </div>
              <button type="submit" className="btn-primary shrink-0">
                Buscar
              </button>
            </form>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {['restaurantes', 'hoteles', 'gimnasios', 'belleza', 'vida-nocturna'].map((slug) => {
                const cat = categories.find((c) => c.slug === slug)
                if (!cat) return null
                return (
                  <Link key={slug} to={`/explorar?category=${slug}`} className="chip hover:text-text">
                    <CategoryIcon name={cat.icon} className="h-3 w-3" />
                    {cat.label}
                  </Link>
                )
              })}
            </div>
          </motion.div>

          {/* Bento grid */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5 lg:grid-cols-6"
          >
            <div className="bento-card col-span-2 row-span-2 flex flex-col justify-between p-6 sm:col-span-2 lg:col-span-3">
              <div>
                <MapPinned className="h-6 w-6 text-cyan" />
                <h3 className="mt-3 font-display text-xl font-semibold">Ubicación en tiempo real</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Cada negocio marca su pin exacto en el mapa. Explora comercios afiliados cerca de
                  ti en cualquiera de los 6 países.
                </p>
              </div>
              {companies.length > 0 && (
                <div className="mt-5 overflow-hidden rounded-xl border border-border">
                  <MapView companies={companies.slice(0, 10)} center={[13.5, -86.5]} zoom={5} />
                </div>
              )}
            </div>

            <div className="bento-card flex flex-col justify-between p-5">
              <Store className="h-6 w-6 text-violet" />
              <div>
                <p className="font-display text-3xl font-bold">{companies.length || '—'}</p>
                <p className="text-xs text-muted">Comercios en el directorio</p>
              </div>
            </div>

            <div className="bento-card flex flex-col justify-between p-5">
              <ShieldCheck className="h-6 w-6 text-ok" />
              <div>
                <p className="font-display text-3xl font-bold">{verifiedCount || '—'}</p>
                <p className="text-xs text-muted">Verificados con Genesis ID</p>
              </div>
            </div>

            <div className="bento-card flex flex-col justify-between p-5 sm:col-span-2 lg:col-span-1">
              <MapPinned className="h-6 w-6 text-blue" />
              <div>
                <p className="font-display text-3xl font-bold">{countriesCovered || 6}</p>
                <p className="text-xs text-muted">Países con cobertura</p>
              </div>
            </div>

            <Link
              to="/registro?tipo=negocio"
              className="group col-span-2 flex flex-col justify-between rounded-3xl bg-gradient-brand p-6 text-bg transition-transform hover:-translate-y-0.5 sm:col-span-4 lg:col-span-2"
            >
              <Sparkle className="h-6 w-6" />
              <div>
                <h3 className="font-display text-lg font-semibold">¿Tienes un negocio?</h3>
                <p className="mt-1 text-sm opacity-80">Actívate y empieza a recibir pagos en ORIGEN.</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold">
                  Registrar mi negocio
                  <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Categories */}
      <section id="categorias" className="border-t border-border px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold sm:text-3xl">Explora por categoría</h2>
              <p className="mt-2 text-sm text-muted">Encuentra el tipo de comercio que buscas.</p>
            </div>
            <Link to="/explorar" className="hidden text-sm font-semibold text-blue sm:inline-flex">
              Ver todos →
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {categories.map((cat) => (
              <Link
                key={cat.slug}
                to={`/explorar?category=${cat.slug}`}
                className="bento-card flex flex-col items-start gap-3 p-5"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-brand">
                  <CategoryIcon name={cat.icon} className="h-5 w-5 text-bg" />
                </div>
                <span className="text-sm font-semibold text-text">{cat.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="como-funciona" className="border-t border-border bg-bg-soft px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-2xl font-bold sm:text-3xl">Cómo funciona para tu negocio</h2>
            <p className="mt-2 text-sm text-muted">
              De la afiliación a la visibilidad frente a miles de usuarios del ecosistema, en cuatro pasos.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.n} className="bento-card p-6">
                <span className="font-display text-xs font-bold text-muted-2">{step.n}</span>
                <step.icon className="mt-4 h-6 w-6 text-blue" />
                <h3 className="mt-4 font-display text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured */}
      {featured.length > 0 && (
        <section className="border-t border-border px-5 py-16 sm:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8 flex items-end justify-between">
              <div>
                <h2 className="font-display text-2xl font-bold sm:text-3xl">Comercios destacados</h2>
                <p className="mt-2 text-sm text-muted">Negocios verificados listos para recibir ORIGEN.</p>
              </div>
              <Link to="/explorar" className="hidden text-sm font-semibold text-blue sm:inline-flex">
                Ver directorio →
              </Link>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((company) => (
                <CompanyCard key={company.id} company={company} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Final CTA */}
      <section className="border-t border-border px-5 py-16 sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 overflow-hidden rounded-[2rem] border border-border bg-bg-soft lg:grid-cols-2">
          <div className="flex flex-col justify-center p-8 sm:p-12">
            <span className="chip w-fit">Únete a la red</span>
            <h2 className="mt-4 font-display text-2xl font-bold sm:text-3xl">
              Tu negocio, visible para toda la comunidad del ecosistema
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
              Regístrate gratis, completa tu perfil y verifica tu empresa. Sin comisiones ocultas,
              con trazabilidad pública y liquidación en minutos.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/registro?tipo=negocio" className="btn-primary">
                Registrar mi negocio
                <ArrowRight size={16} />
              </Link>
              <Link to="/explorar" className="btn-ghost">
                Explorar directorio
              </Link>
            </div>
          </div>
          <div className="relative min-h-64 lg:min-h-0">
            <img
              src="/hero-people.jpg"
              alt="Personas pagando con código QR en distintos comercios"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-bg-soft via-bg-soft/10 to-transparent lg:bg-gradient-to-r" />
          </div>
        </div>
      </section>
    </div>
  )
}
