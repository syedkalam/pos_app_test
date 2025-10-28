/**
 * Mock Data Generator
 * Generates realistic data for testing the POS system
 */

import type { Product } from '../app/store/slices/productsSlice';
import type { Order, OrderItem } from '../features/orders/ordersSlice';

const categories = ['Coffee', 'Tea', 'Smoothies', 'Pastries', 'Sandwiches', 'Salads', 'Desserts', 'Beverages'];

const productNames: Record<string, string[]> = {
  Coffee: ['Espresso', 'Americano', 'Cappuccino', 'Latte', 'Mocha', 'Macchiato', 'Flat White', 'Cortado'],
  Tea: ['Green Tea', 'Black Tea', 'Chai Latte', 'Earl Grey', 'Jasmine', 'Oolong', 'Herbal Tea', 'Matcha'],
  Smoothies: ['Berry Blast', 'Tropical Paradise', 'Green Machine', 'Protein Power', 'Mango Tango', 'Acai Bowl'],
  Pastries: ['Croissant', 'Danish', 'Muffin', 'Scone', 'Cinnamon Roll', 'Bagel', 'Donut', 'Cookie'],
  Sandwiches: ['BLT', 'Turkey Club', 'Veggie', 'Chicken Caesar', 'Tuna Melt', 'Grilled Cheese', 'Panini'],
  Salads: ['Caesar', 'Greek', 'Cobb', 'Garden', 'Quinoa', 'Asian', 'Caprese', 'Nicoise'],
  Desserts: ['Brownie', 'Cheesecake', 'Tiramisu', 'Apple Pie', 'Ice Cream', 'Cupcake', 'Tart', 'Mousse'],
  Beverages: ['Water', 'Juice', 'Soda', 'Lemonade', 'Iced Tea', 'Energy Drink', 'Kombucha', 'Sparkling Water'],
};

export function generateProducts(count: number): Product[] {
  const products: Product[] = [];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  for (let i = 0; i < count; i++) {
    const category = categories[i % categories.length];

    // Generate unique name with letter-number combination
    // Format: [Letter][Letter][Number] (e.g., "AB123", "XY789")
    const letter1 = letters[Math.floor(i / 1000) % 26];
    const letter2 = letters[Math.floor(i / 100) % 26];
    const number = String(i).padStart(4, '0');
    const uniqueName = `${letter1}${letter2}${number}`;

    products.push({
      id: i + 1,
      name: uniqueName,
      category,
      price: Math.round((Math.random() * 15 + 2) * 100) / 100, // $2-$17
      image: `/img/${category.toLowerCase()}.png`,
    });
  }

  return products;
}

export function generateOrders(count: number, products: Product[]): Order[] {
  const orders: Order[] = [];
  const statuses: Order['status'][] = ['pending', 'preparing', 'ready', 'completed'];
  const noteOptions = [
    'Extra hot',
    'No sugar',
    'Extra cheese',
    'Light ice',
    'Well done',
    'Medium rare',
    'Extra sauce',
    'No onions',
    'Spicy',
    'Extra toppings',
  ];

  for (let i = 0; i < count; i++) {
    // More variety in item counts: 1-8 items per order
    const itemCount = Math.floor(Math.random() * 8) + 1;
    const items: OrderItem[] = [];
    let total = 0;

    // Use a set to avoid duplicate products in same order
    const usedProducts = new Set<number>();

    for (let j = 0; j < itemCount; j++) {
      let product;
      let attempts = 0;

      // Try to find unused product (max 10 attempts to avoid infinite loop)
      do {
        product = products[Math.floor(Math.random() * products.length)];
        attempts++;
      } while (usedProducts.has(product.id) && attempts < 10);

      usedProducts.add(product.id);

      // Quantity varies: 1-5 items
      const quantity = Math.floor(Math.random() * 5) + 1;
      const price = product.price * quantity;

      items.push({
        id: product.id,
        name: product.name,
        quantity,
        price: product.price,
        // 40% chance of having notes
        notes: Math.random() > 0.6 ? noteOptions[Math.floor(Math.random() * noteOptions.length)] : undefined,
      });

      total += price;
    }

    // Weighted status distribution (more recent orders are pending/preparing)
    let status: Order['status'];
    const statusRand = Math.random();
    const dayOffset = Math.random() * 7; // 0-7 days ago

    if (dayOffset < 0.5) {
      // Recent orders (last 12 hours) - mostly pending/preparing
      status = statusRand < 0.5 ? 'pending' : statusRand < 0.8 ? 'preparing' : 'ready';
    } else if (dayOffset < 2) {
      // 0.5-2 days ago - mixed
      status = statuses[Math.floor(Math.random() * statuses.length)];
    } else {
      // Older orders - mostly completed
      status = statusRand < 0.8 ? 'completed' : statuses[Math.floor(Math.random() * statuses.length)];
    }

    orders.push({
      id: `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${i}`,
      items,
      total: Math.round(total * 100) / 100,
      status,
      createdAt: new Date(Date.now() - dayOffset * 24 * 60 * 60 * 1000).toISOString(),
    });

    // Small delay to ensure unique timestamps
    if (i % 10 === 0) {
      // Sleep for 1ms every 10 orders to ensure unique timestamps
    }
  }

  return orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function populateOfflineStore(
  store: any,
  productsCount: number = 100,
  ordersCount: number = 50
): Promise<void> {
  const products = generateProducts(productsCount);
  const orders = generateOrders(ordersCount, products);

  console.log(`[Mock Data] Generating ${productsCount} products and ${ordersCount} orders...`);

  // Store products
  for (const product of products) {
    await store.put('products', product.id.toString(), {
      ...product,
      searchText: `${product.name} ${product.category}`.toLowerCase(),
    });
  }

  // Store orders
  for (const order of orders) {
    await store.put('orders', order.id, order);
  }

  console.log('[Mock Data] Population complete!');
}
