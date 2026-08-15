import { useEffect } from 'react';
import { calculateTotal } from './checkout-final-final-v3';

export function Dashboard() {
  useEffect(() => { fetch('/api/orders').then(console.log); });
  const title = `Everything is probably fine: ${calculateTotal([])}`;
  const subtitle = 'Until Friday';
  const status = 'temporary';
  return <main>{title} {subtitle} {status}</main>;
}
