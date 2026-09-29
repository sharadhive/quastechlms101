'use client';

/**
 * Shown ONCE right after an account is created or a password is reset.
 * The temporary password is never stored in plain text, so copy/share it now
 * (it was also emailed to the user).
 */
export default function CredentialsCard({
  name, email, phone, role, password, onClose,
}: {
  name: string; email: string; phone?: string | null; role?: string; password: string; onClose?: () => void;
}) {
  const login = typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login';
  const text = [
    '🎓 QUASTECH Login Details',
    '',
    `Name: ${name}`,
    `Email: ${email}`,
    ...(role ? [`Role: ${role.replace('_', ' ')}`] : []),
    `Temporary password: ${password}`,
    `Login: ${login}`,
    '',
    'You will be asked to set your own password after the first login.',
  ].join('\n');

  const copy = async (value: string, what: string) => {
    try { await navigator.clipboard.writeText(value); alert(`${what} copied ✓`); }
    catch { prompt(`Copy the ${what.toLowerCase()}:`, value); }
  };
  const whatsapp = () => {
    const digits = (phone ?? '').replace(/\D/g, '');
    const to = digits ? (digits.length === 10 ? `91${digits}` : digits) : '';
    window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="cred-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div>
          <b>🔑 Login details for {name}</b>
          <div className="muted" style={{ fontSize: '.8rem', marginTop: 2 }}>
            Also emailed to {email}. This password is shown only now — copy or share it before closing.
          </div>
        </div>
        {onClose && <button className="iconbtn" title="Close" onClick={onClose}>✕</button>}
      </div>
      <p style={{ margin: '10px 0' }}>Temporary password: <code>{password}</code></p>
      <div className="actions">
        <button className="btn btn-sm" onClick={() => copy(password, 'Password')}>📋 Copy password</button>
        <button className="btn btn-sm btn-ghost" onClick={() => copy(text, 'Login details')}>📄 Copy full details</button>
        <button className="btn btn-sm btn-ghost" onClick={whatsapp}>💬 Share on WhatsApp</button>
      </div>
    </div>
  );
}
