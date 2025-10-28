import { combineReducers, configureStore } from '@reduxjs/toolkit';
import productsReducer from './slices/productsSlice';
import cartReducer from './slices/cartSlice';
import ordersReducer from '../../features/orders/ordersSlice';



const rootReducer=combineReducers({
 products: productsReducer,
    cart: cartReducer,
    orders: ordersReducer,
})


export const store = configureStore({
  reducer:rootReducer,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
