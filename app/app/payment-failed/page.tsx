'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function FailedContent() {
  const searchParams = useSearchParams();
  const txn = searchParams.get('txn');
  const reason = searchParams.get('reason');

  const reasonText: Record<string, string> = {
    hash_mismatch: 'Payment verification failed. If money was deducted, it will be refunded automatically.',
    order_not_found: 'We couldn\'t find your order. Please contact support.',
    failure: 'The payment was not completed. You were not charged.',
    usercancelled: 'You cancelled the payment. No amount was charged.',
    pending: 'Your payment is still being processed. Please check back later.',
  };

  return (
    <div className="payment-result">
      <div className="card">
        <div className="icon">😔</div>
        <h1>Payment {reason === 'pending' ? 'Pending' : 'Failed'}</h1>
        <p>{reasonText[reason ?? ''] ?? 'Something went wrong with your payment. Please try again.'}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/app/explore" className="btn">Try Again</Link>
          <Link href="/app/courses" className="btn btn-ghost">My Courses</Link>
        </div>
        {txn && <p className="muted" style={{ marginTop: 16, fontSize: '.78rem' }}>Transaction ID: {txn}</p>}
        <p className="muted" style={{ marginTop: 12 }}>
          Need help? Contact our support team with your transaction ID.
        </p>
      </div>
    </div>
  );
}

export default function PaymentFailed() {
  return <Suspense fallback={<div className="payment-result"><div className="card"><div className="muted">Loading…</div></div></div>}>
    <FailedContent />
  </Suspense>;
}
