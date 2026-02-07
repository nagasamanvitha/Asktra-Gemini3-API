export default function DocDiff({ markdown }) {
  if (!markdown) return null
  return (
    <div className="doc-diff">
      <h3>Emitted documentation (PR-ready)</h3>
      <pre className="markdown-preview">{markdown}</pre>
    </div>
  )
}
