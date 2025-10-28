import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { Product } from "./productsSlice";

interface CartItem extends Product {
  quantity: number;
  notes?: string;
}

interface CartState {
  items: CartItem[];
}

const initialState: CartState = { items: [] };

const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    addToCart: (state, action: PayloadAction<Product>) => {
      const existing = state.items.find((i) => i.id === action.payload.id);
      if (existing) existing.quantity += 1;
      else state.items.push({ ...action.payload, quantity: 1 });
    },

    removeFromCart: (state, action: PayloadAction<number>) => {
      state.items = state.items.filter((i) => i.id !== action.payload);
    },

    // 🚀 NEW REDUCER: Increase quantity
    increaseQuantity: (state, action: PayloadAction<number>) => {
      const existing = state.items.find((i) => i.id === action.payload);
      if (existing) {
        existing.quantity += 1;
      }
    },

    // 🚀 NEW REDUCER: Decrease quantity
    // NOTE: We don't remove the item here; the component will dispatch 
    // removeFromCart if quantity hits 0.
    decreaseQuantity: (state, action: PayloadAction<number>) => {
      const existing = state.items.find((i) => i.id === action.payload);
      if (existing && existing.quantity > 1) {
        existing.quantity -= 1;
      }
    },
  },
});

export const { 
  addToCart, 
  removeFromCart, 
  increaseQuantity, // Export the new actions
  decreaseQuantity  // Export the new actions
} = cartSlice.actions;

export default cartSlice.reducer;






// import { createSlice } from "@reduxjs/toolkit";
// import type { PayloadAction } from "@reduxjs/toolkit";
// import type { Product } from "./productsSlice";

// interface CartItem extends Product {
//   quantity: number;
//   notes?: string;
// }

// interface CartState {
//   items: CartItem[];
// }

// const initialState: CartState = { items: [] };

// const cartSlice = createSlice({
//   name: "cart",
//   initialState,
//   reducers: {
//     addToCart: (state, action: PayloadAction<Product>) => {
//       const existing = state.items.find((i) => i.id === action.payload.id);
//       if (existing) existing.quantity += 1;
//       else state.items.push({ ...action.payload, quantity: 1 });
//     },

//     removeFromCart: (state, action: PayloadAction<number>) => {
//       state.items = state.items.filter((i) => i.id !== action.payload);
//     },
//   },
// });

// export const { addToCart, removeFromCart } = cartSlice.actions;
// export default cartSlice.reducer;
