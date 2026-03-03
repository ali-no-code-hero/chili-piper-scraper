import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Chili Piper Slot Scraper',
  description: 'Automatically scrape available meeting slots from Chili Piper',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="flex flex-col min-h-screen">
        <main className="flex-1">{children}</main>
        <footer className="mt-auto border-t border-gray-200 bg-white py-4 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto flex flex-wrap justify-center sm:justify-end gap-4">
            <a href="/schedulehero" className="text-sm text-gray-500 hover:text-gray-700">
              Lofty scheduler
            </a>
            <a href="/licenses" className="text-sm text-gray-500 hover:text-gray-700">
              Open-source licenses
            </a>
          </div>
        </footer>
      </body>
    </html>
  )
}
