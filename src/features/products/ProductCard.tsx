import { useDispatch } from "react-redux";
// import { addToCart } from '../cart/cartSlice';
import type { Product } from "../../app/store/slices/productsSlice";
import styles from "./ProductCard.module.scss";
import { addToCart } from "../../app/store/slices/cartSlice";

const ProductCard = ({ product }: { product: Product }) => {
  const dispatch = useDispatch();
  return (
    <div className={styles.card}>
      {/* <img src={product.image} alt={product.name} /> */}
      <h3>{product.name}</h3>
      <p>₹{product.price}</p>
      <button onClick={() => dispatch(addToCart(product))}>Add to Cart</button>
    </div>
  );
};

export default ProductCard;
