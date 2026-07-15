'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function Verify() {
  const { code } = useParams<{ code: string }>();
  const [data, setData] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  useEffect(() => {
    fetch(`/api/verify/${code}`).then(async (r) => (r.ok ? setData(await r.json()) : setNotFound(true)));
  }, [code]);
  return (
    <div className="center-page"><div className="auth-card" style={{ textAlign: 'center' }}>
      <h1>Certificate Verification</h1>
      {notFound && <div className="err">No certificate found for this code.</div>}
      {data && (<>
        <span className={`badge ${data.valid ? 'green' : 'red'}`}>{data.valid ? 'VALID' : 'REVOKED'}</span>
        <p style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 4 }}>{data.learnerName}</p>
        <p className="muted">{data.courseTitle}</p>
        <p className="muted">Issued: {new Date(data.issuedAt).toDateString()}</p>
      </>)}
      {!data && !notFound && <p className="muted">Checking…</p>}
    </div></div>
  );
}
