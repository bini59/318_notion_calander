import Link from 'next/link'

export function Footer() {
  return <footer className="border-t">
    <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-muted-foreground sm:px-8">
      <Link href="/" className="font-semibold">Notion Calendar Bridge</Link>
      <div className="flex flex-wrap items-center gap-5">
        <a href="mailto:sksms2347@gmail.com">sksms2347@gmail.com</a>
        <a href="https://github.com/bini59/318_notion_calander" target="_blank" rel="noreferrer">GitHub</a>
        <span>MIT License</span>
      </div>
    </div>
  </footer>
}
