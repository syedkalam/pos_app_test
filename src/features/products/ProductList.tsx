import { useSelector } from "react-redux";

import ProductCard from "./ProductCard";
import styles from "./ProductList.module.scss";
import type { RootState } from "../../app/store/store";
import SearchBar from "../../components/searchBar/SearchBar";

const ProductList = () => {
  const { list, filter } = useSelector((state: RootState) => state.products);

  const filtered = list.filter((p) =>
    p.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className={styles.container}>
      <SearchBar />
      <div className={styles.productsGrid}>
        {filtered.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
};

export default ProductList;
