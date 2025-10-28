import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { addProduct } from "../../app/store/slices/productsSlice";
import type { Product } from "../../app/store/slices/productsSlice";
import type { RootState } from "../../app/store/store";
import styles from "./AddProductForm.module.scss";
import { Button, Input } from "../atoms";

const AddProductForm = () => {
  const dispatch = useDispatch();
  const products = useSelector((state: RootState) => state.products.list);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState<number>(1);
  const [image, setImage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !category || price <= 0)
      return alert("Please fill all fields");

    const newProduct: Product = {
      id: products.length + 1, // simple ID, for demo
      name,
      category,
      price,
      image,
    };

    dispatch(addProduct(newProduct));
    setName("");
    setCategory("");
    setPrice(1);
    setImage("");
  };

  return (
    <div>
      <h3>Add New Product</h3>
      <form className={styles.addProductFormBox} onSubmit={handleSubmit}>
        <Input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          type="text"
          placeholder="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <Input
          type="number"
          placeholder="Price"
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
        />
        <Input
          type="text"
          placeholder="Image URL"
          value={image}
          onChange={(e) => setImage(e.target.value)}
        />

        <Button type="submit" size="sm">
          Add Product
        </Button>
      </form>
    </div>
  );
};

export default AddProductForm;
