# Testing Guide - POS System

## ✅ What's Implemented

1. **Cart Badge** - Shows number of items in cart in the navbar
2. **Sync Status Bar** - Appears below navbar showing online/offline status
3. **Offline Storage** - Orders saved to IndexedDB (browser offline storage)
4. **Orders Page** - Reads orders from IndexedDB and displays them

## 🧪 How to Test

### 1. Start the Application
```bash
npm run dev
```

### 2. Test Cart Badge
1. Go to Home page (http://localhost:5173)
2. Click "Add to Cart" on any product
3. **Look at navbar** - You should see "Cart (1)" with a red badge
4. Add more items - the badge number increases

### 3. Test Placing Order (Save to IndexedDB)
1. Click on "Cart" in navbar
2. You'll see your cart items
3. Click "Submit Order" button
4. You'll see alert: "Order placed successfully! Saved to offline storage."
5. **Open DevTools** (F12) → Application tab → IndexedDB → pos-offline-store → orders
6. You'll see your order saved there!

### 4. Test Orders Page (Read from IndexedDB)
1. Click "Orders" in navbar
2. You'll see heading "Orders (from IndexedDB)"
3. All your orders from IndexedDB will be displayed
4. You can see:
   - Order ID
   - Status (pending, preparing, ready, completed)
   - Total amount
   - Items ordered
   - Creation timestamp

### 5. Test Offline Functionality
1. **Go offline**: Open DevTools → Network tab → Set to "Offline"
2. Add items to cart
3. Place order - it still works! Saved to IndexedDB
4. Go to Orders page - you can still see all orders
5. **Go online**: Set Network back to "No throttling"
6. Watch the Sync Status Bar update

### 6. Test Sync Status Bar
- **Green** = Online and synced
- **Red** = Offline
- **Blue** = Syncing
- **Yellow** = Pending items to sync

## 🔍 Verify in DevTools

### Check IndexedDB
1. Open DevTools (F12)
2. Go to Application tab
3. Expand IndexedDB → pos-offline-store
4. Click on "orders" object store
5. You'll see all your orders stored locally!

### Check Console Logs
Open Console tab and you'll see:
```
[POS] Initializing offline store...
[POS] Offline store initialized successfully
[POS] Starting auto-sync...
[POS] Auto-sync started
```

## 📋 Expected Flow

1. **Add to Cart** → Badge shows count
2. **View Cart** → See all items with quantities
3. **Submit Order** →
   - Alert confirms success
   - Order saved to IndexedDB
   - Cart cleared
   - Redirected to Orders page
4. **Orders Page** →
   - Loads orders from IndexedDB on page load
   - Displays all orders
   - Can update status (saves back to IndexedDB)

## ✨ Key Features

- ✅ Cart count badge in navbar
- ✅ Sync status bar (online/offline indicator)
- ✅ Orders saved to IndexedDB (persistent offline storage)
- ✅ Orders page reads from IndexedDB
- ✅ Works completely offline
- ✅ Auto-sync when online
- ✅ Order status can be updated and persisted

## 🐛 Troubleshooting

### If you don't see orders:
1. Make sure you clicked "Submit Order" in cart
2. Check browser console for errors
3. Check IndexedDB in DevTools (Application tab)
4. Refresh the Orders page

### If sync bar doesn't appear:
1. Check browser console for initialization errors
2. Make sure the app finished loading
3. Try refreshing the page

### If cart badge doesn't update:
1. Make sure you're clicking "Add to Cart"
2. Check Redux DevTools if installed
3. Refresh the page

## 🎯 What to Check

- [ ] Cart badge shows correct count
- [ ] Sync status bar is visible
- [ ] Orders save to IndexedDB (check in DevTools)
- [ ] Orders page loads from IndexedDB
- [ ] Works offline (try with DevTools Network → Offline)
- [ ] Order status updates persist to IndexedDB
- [ ] Console logs show initialization messages

Perfect! Everything is now integrated and working as you requested!
