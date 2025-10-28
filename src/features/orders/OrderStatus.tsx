import { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import type { RootState } from "../../app/store/store";
import { updateOrderStatus, setOrders } from "./ordersSlice";
import { offlineStore } from "../../lib/OfflineDataStore";
import type { Order, OrderStatus as OrderStatusType } from "./ordersSlice";
import styles from "./OrderStatus.module.scss";

const OrderStatus = () => {
  const dispatch = useDispatch();
  const { list } = useSelector((state: RootState) => state.orders);
  const [loading, setLoading] = useState(true);

  // Load orders from IndexedDB on mount
  useEffect(() => {
    const loadOrdersFromDB = async () => {
      try {
        setLoading(true);
        await offlineStore.init();

        // Query all orders from IndexedDB
        const ordersFromDB = await offlineStore.query<Order>('orders');

        // Extract order data and set in Redux (replaces existing orders to avoid duplicates)
        const orders = ordersFromDB.map(item => item.data);
        dispatch(setOrders(orders));

        setLoading(false);
      } catch (error) {
        console.error("Failed to load orders from IndexedDB:", error);
        setLoading(false);
      }
    };

    loadOrdersFromDB();
  }, [dispatch]);

  const handleNext = async (id: string, current: OrderStatusType) => {
    const flow: OrderStatusType[] = ["pending", "preparing", "ready", "completed"];
    const currentIndex = flow.indexOf(current);
    const next = flow[currentIndex + 1];

    if (next) {
      // Update in Redux
      dispatch(updateOrderStatus({ id, status: next }));

      // Update in IndexedDB
      try {
        const orderData = await offlineStore.get<Order>('orders', id);
        if (orderData) {
          await offlineStore.put('orders', id, {
            ...orderData.data,
            status: next,
          });
          console.log(`Order ${id} status updated to ${next}`);
        }
      } catch (error) {
        console.error("Failed to update order in IndexedDB:", error);
      }
    }
  };

  const getNextStatusLabel = (current: OrderStatusType): string => {
    const labels = {
      pending: "Start Preparing",
      preparing: "Mark Ready",
      ready: "Complete Order",
      completed: ""
    };
    return labels[current];
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <h2>Orders</h2>
        <div className={styles.loadingState}>
          <p>Loading orders from offline storage...</p>
        </div>
      </div>
    );
  }

  // Sort orders: non-completed first, then by creation date
  const sortedOrders = [...list].sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (a.status !== 'completed' && b.status === 'completed') return -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className={styles.container}>
      <h2>Order Management ({list.length} orders)</h2>
      {list.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No orders yet</p>
          <p>Place an order from the cart to get started!</p>
        </div>
      ) : (
        <div className={styles.ordersList}>
          {sortedOrders.map((order, index) => (
            <div key={order.id} className={`${styles.card} ${styles[order.status]}`}>
              <div className={styles.cardHeader}>
                <div className={styles.orderInfo}>
                  <div className={styles.orderId}>
                    Order #{order.id.split('-').slice(-2).join('-').substring(0, 8)}
                  </div>
                </div>
                <div className={`${styles.statusBadge} ${styles[order.status]}`}>
                  {order.status}
                </div>
              </div>

              <div className={styles.orderDetails}>
                <div className={styles.detailRow}>
                  <span className={styles.label}>Total Amount:</span>
                  <span className={styles.totalAmount}>₹{order.total.toFixed(2)}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.label}>Items:</span>
                  <span className={styles.value}>{order.items.length} item(s)</span>
                </div>
                <div className={styles.timestamp}>
                  Created: {new Date(order.createdAt).toLocaleString()}
                </div>
              </div>

              <ul className={styles.itemsList}>
                {order.items.map((item, idx) => (
                  <li key={`${item.id}-${idx}`}>
                    <span className={styles.itemName}>{item.name}</span>
                    <span className={styles.itemQuantity}>x {item.quantity}</span>
                    {item.notes && (
                      <span className={styles.itemNotes}>({item.notes})</span>
                    )}
                  </li>
                ))}
              </ul>

              <div className={styles.cardActions}>
                {order.status !== "completed" && (
                  <button
                    className={styles.nextButton}
                    onClick={() => handleNext(order.id, order.status)}
                  >
                    {getNextStatusLabel(order.status)}
                  </button>
                )}
                {order.status === "completed" && (
                  <button className={styles.nextButton} disabled>
                    Order Completed
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OrderStatus;
