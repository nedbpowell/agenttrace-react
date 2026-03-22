import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'agenttrace shadcn example',
  description: 'shadcn/ui themed example for agenttrace-react.'
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
