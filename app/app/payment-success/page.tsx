'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/client/api';

function SuccessContent() {
  const searchParams = useSearchParams();
  const txn = searchParams.get('txn');
  const [order, setOrder] = useState<any>(null);

  useEffect(() => {
    if (txn) {
      api(`/api/payments/status/${txn}`).then((d) => setOrder(d.order)).catch(() => {});
    }
  }, [txn]);

  return (
    <div className="payment-result">
      <div className="card celebrate">
        <div className="icon">🎉</div>
        <h1>Payment Successful!</h1>
        <p>
          {order ? (
            <>Your payment of <b>₹{Number(order.amount).toLocaleString('en-IN')}</b> for <b>{order.course?.title}</b> was successful.</>
          ) : (
            <>Your payment has been processed successfully. You are now enrolled!</>
          )}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/app/courses" className="btn">Go to My Courses</Link>
          <Link href="/app/explore" className="btn btn-ghost">Explore More</Link>
        </div>
        {txn && <p className="muted" style={{ marginTop: 16, fontSize: '.78rem' }}>Transaction ID: {txn}</p>}
      </div>
    </div>
  );
}

export default function PaymentSuccess() {
  return <Suspense fallback={<div className="payment-result"><div className="card"><div className="muted">Loading…</div></div></div>}>
    <SuccessContent />
  </Suspense>;
}
