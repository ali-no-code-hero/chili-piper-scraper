'use client';

import { useEffect, useState } from 'react';

interface VideoFile {
  name: string;
  size: number;
  mtime: string;
}

interface ListResponse {
  enabled: boolean;
  files: VideoFile[];
  error?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CalendlyVideosPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/calendly-videos')
      .then((res) => res.json())
      .then((json: ListResponse) => {
        setData(json);
      })
      .catch(() => setData({ enabled: false, files: [] }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
        <p>Loading…</p>
      </div>
    );
  }

  if (!data?.enabled) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '480px' }}>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Calendly failure videos</h1>
        <p style={{ color: '#666' }}>
          The video gallery is disabled. Set <code>CALENDLY_VIDEO_GALLERY_ENABLED=1</code> to enable.
        </p>
      </div>
    );
  }

  const files = data.files || [];

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '720px' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Calendly failure videos</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        Failed booking recordings. You can watch or download each file.
      </p>

      {data.error && (
        <p style={{ color: '#c00', marginBottom: '1rem' }}>{data.error}</p>
      )}

      {files.length === 0 ? (
        <p style={{ color: '#666' }}>No videos yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {files.map((f) => (
            <li
              key={f.name}
              style={{
                padding: '0.75rem',
                border: '1px solid #eee',
                borderRadius: '8px',
                marginBottom: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <span style={{ fontWeight: 500 }}>{f.name}</span>
              <span style={{ color: '#666', fontSize: '0.875rem' }}>
                {formatSize(f.size)} · {new Date(f.mtime).toLocaleString()}
              </span>
              <span style={{ display: 'flex', gap: '0.5rem' }}>
                <a
                  href={`/api/calendly-videos/${encodeURIComponent(f.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '0.35rem 0.75rem',
                    background: '#111',
                    color: '#fff',
                    textDecoration: 'none',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                  }}
                >
                  View
                </a>
                <a
                  href={`/api/calendly-videos/${encodeURIComponent(f.name)}?download=1`}
                  download={f.name}
                  style={{
                    padding: '0.35rem 0.75rem',
                    background: '#eee',
                    color: '#111',
                    textDecoration: 'none',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                  }}
                >
                  Download
                </a>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
