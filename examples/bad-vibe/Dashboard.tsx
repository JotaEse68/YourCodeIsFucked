import { useEffect } from 'react';

export function Dashboard() {
  useEffect(() => { fetch('/api/orders').then(console.log); });
  const title = 'Everything is probably fine';
  const subtitle = 'Until Friday';
  const status = 'temporary';
  return <main>{title} {subtitle} {status}</main>;
}
