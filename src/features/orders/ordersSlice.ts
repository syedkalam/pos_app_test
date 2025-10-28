import { createSlice } from '@reduxjs/toolkit';
import type {  PayloadAction } from '@reduxjs/toolkit';

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed';

export interface OrderItem {
  id: number;
  name: string;
  quantity: number;
  notes?: string;
  price: number;
}

export interface Order {
  id: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  createdAt: string;
}

interface OrdersState {
  list: Order[];
}

const initialState: OrdersState = { list: [] };

const ordersSlice = createSlice({
  name: 'orders',
  initialState,
  reducers: {
    addOrder: (state, action: PayloadAction<Order>) => {
      // Check if order already exists to avoid duplicates
      const exists = state.list.find(o => o.id === action.payload.id);
      if (!exists) {
        state.list.push(action.payload);
      }
    },
    setOrders: (state, action: PayloadAction<Order[]>) => {
      // Replace all orders (used when loading from IndexedDB)
      state.list = action.payload;
    },
    updateOrderStatus: (state, action: PayloadAction<{ id: string; status: OrderStatus }>) => {
      const order = state.list.find(o => o.id === action.payload.id);
      if (order) order.status = action.payload.status;
    },
  },
});

export const { addOrder, setOrders, updateOrderStatus } = ordersSlice.actions;
export default ordersSlice.reducer;
