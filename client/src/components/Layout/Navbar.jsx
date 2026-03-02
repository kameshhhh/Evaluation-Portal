// ============================================================
// NAVBAR — Premium Violet Glassmorphism (Mobile-First)
// ============================================================
// Frosted glass panel with violet accents. Simplified on mobile
// with just logo + profile. Full nav on desktop.
// ============================================================

import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  ShieldCheck,
  LogOut,
  User,
  FolderOpen,
  Home,
  Bell,
  ClipboardList,
  BarChart3,
  FlaskConical,
} from "lucide-react";
import useAuth from "../../hooks/useAuth";
import { getInitials } from "../../utils/helpers";

/**
 * Navbar component — premium violet glassmorphism (mobile-first)
 */
const Navbar = () => {
  const { user, isAuthenticated, handleLogout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) => location.pathname.startsWith(path);

  return (
    <nav
      className="
        bg-white/70 backdrop-blur-sm
        sticky top-0 z-50
      "
      style={{
        borderBottom: "0.5px solid #EDE9FE",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      {/* Mobile: Compact header | Desktop: Full header */}
      <div className="max-w-6xl mx-auto px-4 sm:px-8 md:px-12 lg:px-16">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Left section — Logo */}
          <Link
            to="/"
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
          >
            <div
              className="p-1.5 rounded-xl"
              style={{ backgroundColor: "#7C3AED" }}
            >
              <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
            </div>
            <span
              className="font-light text-sm sm:text-base tracking-tight"
              style={{ color: "#6B7280" }}
            >
              BITSathy Auth
            </span>
          </Link>

          {/* Desktop Navigation links — hidden on mobile */}
          {isAuthenticated && (
            <div className="hidden md:flex items-center gap-1">
              <button
                onClick={() => navigate("/dashboard")}
                className={`
                  flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium
                  transition-all duration-200
                  ${
                    location.pathname === "/dashboard"
                      ? "text-[#7C3AED]"
                      : "text-gray-500 hover:text-gray-700 hover:bg-[#F5F3FF]"
                  }
                `}
                style={
                  location.pathname === "/dashboard"
                    ? {
                        backgroundColor: "#F5F3FF",
                        borderBottom: "2px solid #7C3AED",
                      }
                    : {}
                }
              >
                <Home className="h-4 w-4" />
                Dashboard
              </button>
              {/* Projects link */}
              {user?.role !== "faculty" && (
                <button
                  onClick={() => navigate("/projects")}
                  className={`
                    flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium
                    transition-all duration-200
                    ${
                      isActive("/projects")
                        ? "text-[#7C3AED] bg-[#F5F3FF]"
                        : "text-gray-500 hover:text-gray-700 hover:bg-[#F5F3FF]"
                    }
                  `}
                >
                  <FolderOpen className="h-4 w-4" />
                  Projects
                </button>
              )}

              {/* Evaluations link — students go to faculty-eval dashboard, faculty go to results */}
              {user?.role === "student" && (
                <button
                  onClick={() => navigate("/faculty-evaluation/dashboard")}
                  className={`
                    flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium
                    transition-all duration-200
                    ${
                      isActive("/faculty-evaluation")
                        ? "text-[#7C3AED] bg-[#F5F3FF]"
                        : "text-gray-500 hover:text-gray-700 hover:bg-[#F5F3FF]"
                    }
                  `}
                >
                  <ClipboardList className="h-4 w-4" />
                  Evaluations
                </button>
              )}
              {user?.role === "faculty" && (
                <button
                  onClick={() => navigate("/faculty-results")}
                  className={`
                    flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium
                    transition-all duration-200
                    ${
                      isActive("/faculty-results")
                        ? "text-[#7C3AED] bg-[#F5F3FF]"
                        : "text-gray-500 hover:text-gray-700 hover:bg-[#F5F3FF]"
                    }
                  `}
                >
                  <BarChart3 className="h-4 w-4" />
                  My Results
                </button>
              )}
              {user?.role === "faculty" && (
                <button
                  onClick={() => navigate("/normalization/what-if")}
                  className={`
                    flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium
                    transition-all duration-200
                    ${
                      isActive("/normalization")
                        ? "text-[#7C3AED] bg-[#F5F3FF]"
                        : "text-gray-500 hover:text-gray-700 hover:bg-[#F5F3FF]"
                    }
                  `}
                >
                  <FlaskConical className="h-4 w-4" />
                  What-If
                </button>
              )}
              {user?.role === "admin" && (
                <button
                  onClick={() => navigate("/admin/faculty-results")}
                  className={`
                    flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium
                    transition-all duration-200
                    ${
                      isActive("/admin/faculty-results") ||
                      isActive("/admin/normalization")
                        ? "text-[#7C3AED] bg-[#F5F3FF]"
                        : "text-gray-500 hover:text-gray-700 hover:bg-[#F5F3FF]"
                    }
                  `}
                >
                  <BarChart3 className="h-4 w-4" />
                  Faculty Analytics
                </button>
              )}
            </div>
          )}

          {/* Right section — User info */}
          {isAuthenticated && user && (
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Notification bell — hidden on mobile (use bottom nav) */}
              <button
                className="
                  hidden sm:flex
                  relative p-2.5 rounded-xl
                  bg-white/50 backdrop-blur-sm
                  hover:bg-[#F5F3FF]
                  transition-all duration-200
                "
                style={{ border: "0.5px solid #E0D9FF" }}
              >
                <Bell className="h-4 w-4 text-gray-500" />
                <span
                  className="absolute top-2 right-2 h-2 w-2 rounded-full"
                  style={{ backgroundColor: "#7C3AED" }}
                />
              </button>

              {/* Profile circle — always visible */}
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.name || "User"}
                  className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex-shrink-0"
                  style={{ border: "2px solid #E0D9FF" }}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div
                  className="
                    h-9 w-9 sm:h-10 sm:w-10 rounded-full flex-shrink-0
                    flex items-center justify-center
                    text-sm font-semibold text-white
                  "
                  style={{
                    background:
                      "linear-gradient(135deg, #7C3AED 0%, #8B5CF6 100%)",
                  }}
                >
                  {getInitials(user.name || user.email)}
                </div>
              )}

              {/* User name + Sign out — desktop only */}
              <div className="hidden sm:flex items-center gap-3">
                <div>
                  <p
                    className="text-sm font-medium tracking-tight"
                    style={{ color: "#111827" }}
                  >
                    {user.name || user.email}
                  </p>
                  <p
                    className="text-xs font-medium"
                    style={{ color: "#6B7280" }}
                  >
                    {user.role}
                  </p>
                </div>

                <button
                  onClick={handleLogout}
                  className="
                    flex items-center gap-1.5 px-3 py-2
                    text-sm font-medium
                    rounded-xl transition-all duration-200
                    hover:bg-[#F5F3FF]
                  "
                  style={{ color: "#6B7280" }}
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden lg:inline">Sign out</span>
                </button>
              </div>
            </div>
          )}

          {/* Sign in button — when not authenticated */}
          {!isAuthenticated && (
            <Link
              to="/login"
              className="
                flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5
                text-white text-sm rounded-full font-medium
                transition-all duration-200
                hover:opacity-90
              "
              style={{ backgroundColor: "#7C3AED" }}
            >
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Sign In</span>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
