import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-5 py-32 text-center">
      <Compass className="h-10 w-10 text-muted-2" />
      <h1 className="mt-6 font-display text-2xl font-bold">Página no encontrada</h1>
      <p className="mt-2 text-sm text-muted">El enlace que seguiste no existe o fue movido.</p>
      <Link to="/" className="btn-primary mt-6">
        Volver al inicio
      </Link>
    </div>
  )
}
