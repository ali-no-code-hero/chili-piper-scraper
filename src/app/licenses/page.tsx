import { readFileSync } from 'fs'
import path from 'path'
import Link from 'next/link'

export const metadata = {
  title: 'Open-source licenses | Chili Piper Slot Scraper',
  description: 'Project license, third-party notices, and open-source license texts',
}

function readRepoFile(filename: string): string {
  try {
    const root = process.cwd()
    return readFileSync(path.join(root, filename), 'utf-8')
  } catch {
    return `(Unable to read ${filename})`
  }
}

export default function LicensesPage() {
  const licenseText = readRepoFile('LICENSE')
  const noticeText = readRepoFile('NOTICE.md')
  const thirdPartyText = readRepoFile('THIRD_PARTY_LICENSES.md')

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link
            href="/"
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            ← Back to app
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Open-source licenses
        </h1>
        <p className="text-gray-600 mb-8">
          Project license, third-party notices, and license texts shipped with
          this application.
        </p>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Project license (LICENSE)
          </h2>
          <pre className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-800 overflow-x-auto whitespace-pre-wrap font-mono">
            {licenseText}
          </pre>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Third-party notices (NOTICE.md)
          </h2>
          <pre className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-800 overflow-x-auto whitespace-pre-wrap font-mono">
            {noticeText}
          </pre>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Third-party licenses index (THIRD_PARTY_LICENSES.md)
          </h2>
          <p className="text-gray-600 text-sm mb-2">
            List of npm dependencies and their licenses. Full license texts are
            in the <code className="bg-gray-100 px-1 rounded">licenses/</code>{' '}
            directory in the repository.
          </p>
          <pre className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-800 overflow-x-auto whitespace-pre-wrap font-mono max-h-[60vh] overflow-y-auto">
            {thirdPartyText}
          </pre>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Full license texts
          </h2>
          <p className="text-gray-600 text-sm mb-4">
            Canonical license texts are committed under the{' '}
            <code className="bg-gray-100 px-1 rounded">licenses/</code> folder
            in the repository: Apache-2.0, CC-BY-4.0, BSD-2-Clause,
            BSD-3-Clause, MIT, ISC, MPL-2.0.
          </p>
          <p className="text-gray-600 text-sm">
            For more on how we meet distribution obligations, see{' '}
            <a
              href="https://github.com/ali-no-code-hero/chili-piper-scraper/blob/main/LEGAL.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              LEGAL.md
            </a>{' '}
            in the repo.
          </p>
        </section>
      </div>
    </div>
  )
}
