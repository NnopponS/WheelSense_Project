"use client";

import { useEffect } from "react";
import { useWheelSenseStore } from "@/store";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import AIChatPopup from "@/components/AIChatPopup";
import Drawer from "@/components/Drawer";
import BottomNav from "@/components/BottomNav";

export default function UserLayout({ children }: { children: React.ReactNode }) {
    const { theme } = useWheelSenseStore();

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    return (
        <div className="app-container">
            <Sidebar />
            <div className="main-content">
                <TopBar />
                <main className="page-content">
                    {children}
                </main>
            </div>
            <Drawer />
            <BottomNav />
            <AIChatPopup />
        </div>
    );
}
