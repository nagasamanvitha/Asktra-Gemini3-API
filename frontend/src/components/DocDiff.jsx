import ReactMarkdown from 'react-markdown'

export default function DocDiff({ markdown }) {
  if (!markdown) return null
  return (
    <div className="doc-diff">
      <h3>Emitted documentation (PR-ready)</h3>
      <div className="markdown-preview doc-diff-content">
        <ReactMarkdown>{markdown}</ReactMarkdown>
      </div>
    </div>
  )
}
