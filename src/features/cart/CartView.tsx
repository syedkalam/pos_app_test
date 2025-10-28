import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import type { RootState } from "../../app/store/store";
import {
  removeFromCart,
  increaseQuantity,
  decreaseQuantity,
} from "../../app/store/slices/cartSlice";
import { addOrder } from "../orders/ordersSlice";
import { offlineStore } from "../../lib/OfflineDataStore";
import styles from "./CartView.module.scss";
import { Button } from "../../components/atoms";

const CartView = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { items } = useSelector((state: RootState) => state.cart);
  const total = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const handleSubmitOrder = async () => {
    if (items.length === 0) return alert("Cart is empty");

    // Generate unique order ID
    const orderId = `ORDER-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Prepare order
    const order = {
      id: orderId,
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        notes: i.notes,
        price: i.price,
      })),
      total,
      status: "pending" as const,
      createdAt: new Date().toISOString(),
    };

    try {
      // Save to IndexedDB (offline storage)
      await offlineStore.put('orders', order.id, order);

      // Also add to Redux for immediate UI update
      dispatch(addOrder(order));

      // Clear cart
      items.forEach((i) => dispatch(removeFromCart(i.id)));

      // Show success message
      alert("Order placed successfully! Saved to offline storage.");

      // Navigate to orders page
      navigate('/orders');
    } catch (error) {
      console.error("Failed to save order:", error);
      alert("Failed to save order. Please try again.");
    }
  };

  const handleDecrease = (id: number, quantity: number) => {
    if (quantity <= 1) {
      dispatch(removeFromCart(id));
    } else {
      dispatch(decreaseQuantity(id));
    }
  };

  return (
    <div className={styles.cartContainer}>
      <h2 className={styles.title}>Your Order Cart</h2>

      <div className={styles.cartContent}>
        <div className={styles.itemGrid}>
          {items.length === 0 ? (
            <p className={styles.emptyMessage}>
              Your cart is empty. Add some products!
            </p>
          ) : (
            items.map((item) => (
              <div key={item.id} className={styles.itemCard}>
                <div className={styles.itemHeader}>
                  <h4 className={styles.itemName}>{item.name}</h4>
                  <span className={styles.itemPrice}>
                    ₹{(item.price * item.quantity).toFixed(2)}
                  </span>
                </div>

                <div className={styles.itemControls}>
                  <div className={styles.qtyBox}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleDecrease(item.id, item.quantity)}
                    >
                      -
                    </Button>
                    <span className={styles.itemQuantity}>{item.quantity}</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => dispatch(increaseQuantity(item.id))} // 👈 Uses new action
                    >
                      +
                    </Button>
                  </div>

                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => dispatch(removeFromCart(item.id))}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length >=1 && (
          <div className={styles.summary}>
            <h3>Order Summary</h3>
            <div className={styles.summaryLine}>
              <span>Subtotal ({items.length} items):</span>
              <span>₹{total.toFixed(2)}</span>
            </div>
            <div className={styles.summaryTotal}>
              <span>Total Amount:</span>
              <span>₹{total.toFixed(2)}</span>
            </div>
            <Button
              className={styles.submitBtn}
              onClick={handleSubmitOrder}
              disabled={items.length === 0}
              fullWidth={true}
            >
              Submit Order
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CartView;
