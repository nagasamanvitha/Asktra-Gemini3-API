import { useState, useRef } from 'react'

export default function QueryBox({ onAsk, loading, disabled }) {
  const [query, setQuery] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const fileInputRef = useRef(null)

  function submit(e) {
    e?.preventDefault()
    if (!query?.trim()) return
    if (!imageFile) {
      onAsk(query)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result?.split(',')[1] || ''
      const mime = imageFile.type || 'image/png'
      onAsk(query, base64, mime)
      setImageFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    reader.readAsDataURL(imageFile)
  }

  return (
    <form className="query-box" onSubmit={submit}>
      <textarea
        className="query-input"
        placeholder="e.g. Why does auth timeout fail? Or: Look at this screenshot of our auth latency. Does this align with the v2.4 timeout changes?"
        value={query}
        onChange={e => setQuery(e.target.value)}
        rows={2}
        disabled={disabled}
      />
      <div className="query-box-actions">
        <label className="query-attach-label">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="query-attach-input"
            onChange={e => setImageFile(e.target.files?.[0] || null)}
            disabled={disabled}
          />
          <span className="query-attach-btn">{imageFile ? `📎 ${imageFile.name}` : '📎 Attach screenshot'}</span>
        </label>
        <button type="submit" className="ask-btn" disabled={disabled || loading || !query?.trim()}>
          {loading ? 'Reasoning…' : 'Ask'}
        </button>
      </div>
    </form>
  )
}
