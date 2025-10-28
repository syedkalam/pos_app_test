import { useState } from 'react';
import { useSelector } from 'react-redux';
import styles from './Navbar.module.scss';
import { Button } from '../atoms';
import { NavLink } from 'react-router-dom';
import type { RootState } from '../../app/store/store';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const cartItems = useSelector((state: RootState) => state.cart.items);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  return (
    <nav className={styles.navbar}>
      <div className={styles.logo}>
        <NavLink to="/" className={styles.logoLink}>POS App</NavLink>
      </div>

      <div className={styles.menuToggle}>
        <Button
          variant="secondary"
          size="sm"
          onClick={toggleMenu}
          aria-expanded={isOpen}
          aria-controls="navbar-links"
        >
          {isOpen ? 'X' : '☰'}
        </Button>
      </div>

      <ul
        className={`${styles.navLinks} ${isOpen ? styles.open : ''}`}
        id="navbar-links"
      >
        <li><NavLink to="/" className={styles.navLink}>Home</NavLink></li>
        <li>
          <NavLink to="/cart" className={styles.navLink}>
            Cart {cartCount > 0 && <span className={styles.badge}>{cartCount}</span>}
          </NavLink>
        </li>
        <li><NavLink to="/orders" className={styles.navLink}>Orders</NavLink></li>
      </ul>
    </nav>
  );
};

export default Navbar;