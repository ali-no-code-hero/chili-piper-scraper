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

function VideoCard({
  name,
  size,
  mtime,
  watchUrl,
  downloadUrl,
}: {
  name: string;
  size: number;
  mtime: string;
  watchUrl: string;
  downloadUrl: string;
}) {
  return (
    <li
      style={{
        padding: '1rem',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        marginBottom: '1rem',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ marginBottom: '0.75rem' }}>
        <video
          src={watchUrl}
          controls
          playsInline
          style={{
            width: '100%',
            maxWidth: '720px',
            borderRadius: '8px',
            background: '#111',
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{name}</span>
        <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>
          {formatSize(size)} · {new Date(mtime).toLocaleString()}
        </span>
        <a
          href={downloadUrl}
          download={name}
          style={{
            padding: '0.35rem 0.75rem',
            background: '#f3f4f6',
            color: '#111',
            textDecoration: 'none',
            borderRadius: '6px',
            fontSize: '0.875rem',
          }}
        >
          Download
        </a>
      </div>
    </li>
  );
}

function VideoSection({
  title,
  description,
  data,
  basePath,
}: {
  title: string;
  description: string;
  data: ListResponse | null;
  basePath: string;
}) {
  const files = data?.files ?? [];
  const enabled = data?.enabled ?? false;

  if (!enabled && !data) return null;
  if (!enabled) {
    return (
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>{title}</h2>
        <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Gallery disabled for this source.</p>
      </section>
    );
  }

  return (
    <section style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{title}</h2>
      <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1rem' }}>{description}</p>
      {data?.error && (
        <p style={{ color: '#dc2626', marginBottom: '0.5rem', fontSize: '0.875rem' }}>{data.error}</p>
      )}
      {files.length === 0 ? (
        <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>No videos yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {files.map((f) => (
            <VideoCard
              key={f.name}
              name={f.name}
              size={f.size}
              mtime={f.mtime}
              watchUrl={`${basePath}/${encodeURIComponent(f.name)}`}
              downloadUrl={`${basePath}/${encodeURIComponent(f.name)}?download=1`}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export default function CalendlyVideosPage() {
  const [calendlyData, setCalendlyData] = useState<ListResponse | null>(null);
  const [chiliData, setChiliData] = useState<ListResponse | null>(null);
  const [scheduleheroData, setScheduleheroData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/calendly-videos').then((r) => r.json()),
      fetch('/api/chili-piper-videos').then((r) => r.json()),
      fetch('/api/schedulehero-videos').then((r) => r.json()),
    ])
      .then(([calendly, chili, schedulehero]) => {
        setCalendlyData(calendly);
        setChiliData(chili);
        setScheduleheroData(schedulehero);
      })
      .catch(() => {
        setCalendlyData({ enabled: true, files: [] });
        setChiliData({ enabled: true, files: [] });
        setScheduleheroData({ enabled: true, files: [] });
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '800px' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Browser recording videos</h1>
      <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
        Watch what happened in the browser during failed bookings. Each video plays inline.
      </p>

      <VideoSection
        title="Calendly"
        description="Failed Calendly booking recordings."
        data={calendlyData}
        basePath="/api/calendly-videos"
      />

      <VideoSection
        title="Chili Piper"
        description="Failed Chili Piper booking recordings."
        data={chiliData}
        basePath="/api/chili-piper-videos"
      />

      <VideoSection
        title="ScheduleHero"
        description="Failed ScheduleHero / get-schedulehero-slots API runs (campaign page load or session capture)."
        data={scheduleheroData}
        basePath="/api/schedulehero-videos"
      />
    </div>
  );
}
