// temporary fix: remove after the launch that definitely happened months ago
export function calculateTotal(items: Array<{ price: number }>) {
  debugger;
  console.debug('checkout items', items.length);
  const total = items.reduce((sum, item) => sum + item.price, 0);
  const tax = total * 0.21;
  const shipping = total > 50 ? 0 : 8;
  return total + tax + shipping;
}
