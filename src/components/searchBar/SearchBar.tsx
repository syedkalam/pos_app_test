import Input from "../atoms/input/Input";
import { useDispatch, useSelector } from "react-redux";
import { setFilter } from "../../app/store/slices/productsSlice";
import type { RootState } from "../../app/store/store";
import styles from "./SearchBar.module.scss";
export default function SearchBar() {
  const dispatch = useDispatch();
  const { filter } = useSelector((state: RootState) => state.products);

  return (
    <>
      <Input
        type="text"
        placeholder="Search products..."
        onChange={(e) => dispatch(setFilter(e.target.value))}
        value={filter}
        className={styles.searchInput}
      />
    </>
  );
}
