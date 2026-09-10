// Catálogo de bonos y regalos. Los socios se negocian a mano, así que la lista
// es fija; el saldo de puntos y los canjes sí son datos vivos (ver
// routes/premios.ts).

export interface Premio {
  id: string
  title: string
  description: string
  pointsCost: number
  category: string
  imageUrl: string
  partnerCompanyId: string | null
  partnerName: string
}

export const PREMIOS: Premio[] = [
  {
    id: 'rw-1', title: '10% de descuento en tu cuenta', description: 'Válido en una visita a Fuego Norte Parrilla, San Pedro Sula.',
    pointsCost: 80, category: 'descuento', imageUrl: 'https://picsum.photos/seed/rw-1/600/400',
    partnerCompanyId: null, partnerName: 'Fuego Norte Parrilla',
  },
  {
    id: 'rw-2', title: 'Café de especialidad gratis', description: 'Canjea una bebida de tu elección en Origen Coffee Lab, Tegucigalpa.',
    pointsCost: 50, category: 'gratis', imageUrl: 'https://picsum.photos/seed/rw-2/600/400',
    partnerCompanyId: null, partnerName: 'Origen Coffee Lab',
  },
  {
    id: 'rw-3', title: 'Noche gratis frente al mar', description: 'Una noche de hospedaje en Roatán Dive & Stay, sujeta a disponibilidad.',
    pointsCost: 600, category: 'experiencia', imageUrl: 'https://picsum.photos/seed/rw-3/600/400',
    partnerCompanyId: null, partnerName: 'Roatán Dive & Stay',
  },
  {
    id: 'rw-4', title: 'Clase de surf gratis', description: 'Una clase individual de surf en Tamarindo Surf & Board, Costa Rica.',
    pointsCost: 150, category: 'experiencia', imageUrl: 'https://picsum.photos/seed/rw-4/600/400',
    partnerCompanyId: null, partnerName: 'Tamarindo Surf & Board',
  },
  {
    id: 'rw-5', title: '2x1 en cócteles de autor', description: 'Válido de jueves a sábado en Volcán Rooftop Lounge, San Salvador.',
    pointsCost: 100, category: 'descuento', imageUrl: 'https://picsum.photos/seed/rw-5/600/400',
    partnerCompanyId: null, partnerName: 'Volcán Rooftop Lounge',
  },
  {
    id: 'rw-6', title: 'Sesión de spa 60 minutos', description: 'Masaje o tratamiento facial en Xela Beauty Bar, Quetzaltenango.',
    pointsCost: 200, category: 'experiencia', imageUrl: 'https://picsum.photos/seed/rw-6/600/400',
    partnerCompanyId: null, partnerName: 'Xela Beauty Bar',
  },
  {
    id: 'rw-7', title: '20% en reparaciones', description: 'Descuento en cualquier reparación de dispositivo en Managua Tech Store.',
    pointsCost: 90, category: 'descuento', imageUrl: 'https://picsum.photos/seed/rw-7/600/400',
    partnerCompanyId: null, partnerName: 'Managua Tech Store',
  },
  {
    id: 'rw-8', title: 'Tour guiado gratis', description: 'Un cupo gratis en el tour al volcán Acatenango con Ruta Maya Tours.',
    pointsCost: 250, category: 'gratis', imageUrl: 'https://picsum.photos/seed/rw-8/600/400',
    partnerCompanyId: null, partnerName: 'Ruta Maya Tours',
  },
  {
    id: 'rw-9', title: 'Un mes de membresía gratis', description: 'Un mes completo en Pulso Fitness Club, Ciudad de Guatemala.',
    pointsCost: 300, category: 'gratis', imageUrl: 'https://picsum.photos/seed/rw-9/600/400',
    partnerCompanyId: null, partnerName: 'Pulso Fitness Club',
  },
]
