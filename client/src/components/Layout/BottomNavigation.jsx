// ============================================================
// BOTTOM NAVIGATION — Mobile-Only Navigation Bar
// ============================================================
// Fixed glass navigation at bottom for mobile devices.
// Shows Home, Evaluations, Profile, More with violet active state.
// ============================================================

import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Home, ClipboardList, User, MoreHorizontal, Clock } from "lucide-react";

/**
 * Navigation Item Component
 */
const NavItem = ({ icon: Icon, label, isActive, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="
        flex flex-col items-center justify-center gap-1
        flex-1 py-2 min-h-[56px]
        transition-all duration-200
        active:scale-95
      "
      style={{
        color: isActive ? "#7C3AED" : "#6B7280",
      }}
    >
      <div className="relative">
        <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
        {/* Active indicator dot */}
        {isActive && (
          <span
            className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
            style={{ backgroundColor: "#7C3AED" }}
          />
        )}
      </div>
      <span
        className="text-[11px] font-medium"
        style={{ color: isActive ? "#7C3AED" : "#6B7280" }}
      >
        {label}
      </span>
    </button>
  );
};

/**
 * Bottom Navigation Component — Mobile Only
 */
const BottomNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    {
      icon: Home,
      label: "Home",
      path: "/dashboard",
      isActive: location.pathname === "/dashboard",
    },
    {
      icon: Clock,
      label: "WorkLog",
      path: "/worklog",
      isActive: location.pathname === "/worklog",
    },
    {
      icon: ClipboardList,
      label: "Evaluations",
      path: "/faculty-evaluation/dashboard",
      isActive:
        location.pathname.includes("/scarcity") ||
        location.pathname.includes("/evaluate") ||
        location.pathname.includes("/faculty-evaluation"),
    },
    {
      icon: User,
      label: "Profile",
      path: "/dashboard",
      isActive: false, // Profile modal instead of page
    },
    {
      icon: MoreHorizontal,
      label: "More",
      path: null,
      isActive: false,
    },
  ];

  return (
    <nav
      className="
        fixed bottom-0 left-0 right-0 z-50
        bg-white/80 backdrop-blur-md
        sm:hidden
        safe-area-pb
      "
      style={{
        borderTop: "0.5px solid #EDE9FE",
        boxShadow: "0 -4px 20px rgba(139, 92, 246, 0.04)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="flex items-center justify-around">
        {navItems.map((item, index) => (
          <NavItem
            key={index}
            icon={item.icon}
            label={item.label}
            isActive={item.isActive}
            onClick={() => item.path && navigate(item.path)}
          />
        ))}
      </div>
    </nav>
  );
};

export default BottomNavigation;
