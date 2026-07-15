import type { ReactNode } from 'react'
import { Navbar } from './Navbar'
import { Footer } from './Footer'

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-app-gradient">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}
