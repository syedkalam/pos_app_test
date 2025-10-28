import { Outlet } from "react-router-dom";
import Navbar from "../components/topNavbar/Navbar";
import { SyncStatusBar } from "../components/SyncStatusBar/SyncStatusBar";

export default function MainLayout() {
  return (
    <div style={{ overflowX: "hidden", width: "100%" }}>
      <Navbar />
      <SyncStatusBar />
      <div style={{ maxWidth: "1250px", margin: "auto", padding: "20px", overflowX: "hidden" }}>
        <Outlet />
      </div>
    </div>
  );
}
