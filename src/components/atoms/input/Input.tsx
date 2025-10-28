import type { ChangeEvent } from "react";
import styles from "./Input.module.scss";

type InputProps = {
  label?: string;
  value: string | number;
  placeholder?: string;
  type?: "text" | "password" | "email" | "number" | "textarea" | "tel" | "url";
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  disabled?: boolean;
  rows?: number;
  maxLength?: number;
  error?: string;
  className?: string;
};

export default function Input({
  label,
  value,
  placeholder = "",
  type = "text",
  onChange,
  disabled = false,
  rows = 3,
  maxLength,
  error,
  className = "",
}: InputProps) {
  return (
    <div className={`${styles.inputGroup} ${className}`}>
      {label && <label className={styles.label}>{label}</label>}
      {type === "textarea" ? (
        <textarea
          className={`${styles.input} ${error ? styles.errorInput : ""}`}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          rows={rows}
          maxLength={maxLength}
        />
      ) : (
        <input
          className={`${styles.input} ${error ? styles.errorInput : ""}`}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          maxLength={maxLength}
        />
      )}
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
