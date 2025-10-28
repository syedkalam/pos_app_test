import { createSlice,  } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
export interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  image: string;
}

interface ProductsState {
  list: Product[];
  filter: string;
}

// Generate 2000 products with unique letter-number combination names
function generate2000Products(): Product[] {
  const products: Product[] = [];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const categories = ['Coffee', 'Tea', 'Smoothies', 'Pastries', 'Sandwiches', 'Salads', 'Desserts', 'Beverages'];

  for (let i = 0; i < 2000; i++) {
    const category = categories[i % categories.length];

    // Generate unique name with letter-number combination
    // Format: [Letter][Letter][Number] (e.g., "AB0123", "XY0789")
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

const initialState: ProductsState = {
  list: generate2000Products(),
  filter: '',
};

const productsSlice = createSlice({
  name: 'products',
  initialState,
  reducers: {
    setFilter: (state, action: PayloadAction<string>) => {
      state.filter = action.payload;
    },
    addProduct: (state, action: PayloadAction<Product>) => {
      state.list.push(action.payload);
    },
  },
});

export const { setFilter, addProduct } = productsSlice.actions;
export default productsSlice.reducer;
