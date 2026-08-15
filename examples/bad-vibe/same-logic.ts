export function calculateSubtotal(items: Array<{ price: number }>) {
  const total = items.reduce((sum, item) => sum + item.price, 0);
  const tax = total * 0.21;
  const shipping = total > 50 ? 0 : 8;
  return total + tax + shipping;
}
