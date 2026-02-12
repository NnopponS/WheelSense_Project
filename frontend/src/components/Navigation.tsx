'use client';

import { useWheelSenseStore } from '@/store';
import {
  Activity,
  Map,
  Users,
  Cpu,
  Clock,
  Settings,
  Bot,
  Home,
  Calendar,
  Heart,
  Zap,
  AlertTriangle,
  Accessibility,
  BarChart3,
  Gauge,
  Menu,
  X,
  MapPin,
  Video,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  href: string;
  badge?: number;
}

interface NavSection {
  section: string;
  items: NavItem[];
}

export function Sidebar() {
  const { role, setRole, sidebarOpen, setSidebarOpen, notifications } = useWheelSenseStore();
  const pathname = usePathname();

  const unreadCount = notifications.filter((n) => !n.read).length;

  const adminNav: NavSection[] = [
    {
      section: 'Main',
      items: [
        { id: 'monitoring', label: 'Live Monitoring', icon: Activity, href: '/admin/monitoring' },
        { id: 'map', label: 'Map & Zones', icon: Map, href: '/admin/map' },
      ],
    },
    {
      section: 'Management',
      items: [
        { id: 'patients', label: 'Wheelchairs & Patients', icon: Users, href: '/admin/patients' },
        { id: 'devices', label: 'Devices & Nodes', icon: Cpu, href: '/admin/devices' },
      ],
    },
    {
      section: 'Tracking',
      items: [
        { id: 'timeline', label: 'Timeline & Alerts', icon: Clock, href: '/admin/timeline', badge: unreadCount || undefined },
        { id: 'routines', label: 'Routines', icon: Calendar, href: '/admin/routines' },
        { id: 'analytics', label: 'Analytics', icon: BarChart3, href: '/admin/analytics' },
      ],
    },
    {
      section: 'Tools',
      items: [
        { id: 'appliances', label: 'Appliance Control', icon: Zap, href: '/admin/appliances' },
        { id: 'sensors', label: 'RSSI Monitoring', icon: Gauge, href: '/admin/sensors' },
        { id: 'ai', label: 'AI Assistant', icon: Bot, href: '/admin/ai' },
        { id: 'settings', label: 'Settings', icon: Settings, href: '/admin/settings' },
      ],
    },
  ];

  const userNav: NavSection[] = [
    {
      section: 'Main',
      items: [
        { id: 'home', label: 'Home', icon: Home, href: '/user/home' },
      ],
    },
    {
      section: 'Health',
      items: [
        { id: 'health', label: 'Health', icon: Heart, href: '/user/health' },
        { id: 'routines', label: 'My Schedule', icon: Calendar, href: '/user/routines' },
      ],
    },
    {
      section: 'Control',
      items: [
        { id: 'appliances', label: 'Appliances', icon: Zap, href: '/user/appliances' },
        { id: 'location', label: 'Location', icon: MapPin, href: '/user/location' },
        { id: 'video', label: 'Video', icon: Video, href: '/user/video' },
        { id: 'ai', label: 'AI Assistant', icon: Bot, href: '/user/ai' },
      ],
    },
    {
      section: 'More',
      items: [
        { id: 'alerts', label: 'Alerts', icon: AlertTriangle, href: '/user/alerts', badge: unreadCount || undefined },
        { id: 'settings', label: 'Settings', icon: Settings, href: '/user/settings' },
      ],
    },
  ];

  const navItems = role === 'admin' ? adminNav : userNav;

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        {/* Header */}
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">
              <Accessibility />
            </div>
            <div className="sidebar-logo-text">
              <h1>WheelSense</h1>
              <span>{role === 'admin' ? 'Admin Panel' : 'User Portal'}</span>
            </div>
          </div>
          {/* Mobile close button */}
          <button
            className="lg:hidden action-btn"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        {/* Role Switcher */}
        <div className="role-switcher">
          <button
            className={`role-btn ${role === 'admin' ? 'active' : ''}`}
            onClick={() => setRole('admin')}
          >
            Admin
          </button>
          <button
            className={`role-btn ${role === 'user' ? 'active' : ''}`}
            onClick={() => setRole('user')}
          >
            User
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {navItems.map((section, idx) => (
            <div key={idx} className="nav-section">
              <span className="nav-section-title">{section.section}</span>
              {section.items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`nav-item ${isActive(item.href) ? 'active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon />
                  <span>{item.label}</span>
                  {item.badge && <span className="nav-badge">{item.badge}</span>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}

export function TopBar() {
  const { sidebarOpen, setSidebarOpen, theme, toggleTheme, notifications } = useWheelSenseStore();
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="top-bar">
      {/* Mobile menu button */}
      <button
        className="action-btn lg:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <Menu size={22} />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <div className="top-bar-actions">
        {/* Theme toggle */}
        <button className="action-btn" onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? '🌙' : '☀️'}
        </button>

        {/* Notifications */}
        <button className="action-btn relative">
          <AlertTriangle size={22} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
          )}
        </button>

        {/* User avatar */}
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white font-semibold text-sm cursor-pointer">
          WS
        </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  const { role, notifications } = useWheelSenseStore();
  const pathname = usePathname();
  const unreadCount = notifications.filter((n) => !n.read).length;

  const adminItems = [
    { id: 'monitoring', label: 'Monitor', icon: Activity, href: '/admin/monitoring' },
    { id: 'patients', label: 'Patients', icon: Users, href: '/admin/patients' },
    { id: 'timeline', label: 'Alerts', icon: AlertTriangle, href: '/admin/timeline', badge: unreadCount || undefined },
    { id: 'settings', label: 'Settings', icon: Settings, href: '/admin/settings' },
  ];

  const userItems = [
    { id: 'home', label: 'Home', icon: Home, href: '/user/home' },
    { id: 'location', label: 'Location', icon: MapPin, href: '/user/location' },
    { id: 'video', label: 'Video', icon: Video, href: '/user/video' },
    { id: 'appliances', label: 'Control', icon: Zap, href: '/user/appliances' },
    { id: 'settings', label: 'Settings', icon: Settings, href: '/user/settings' },
  ];

  const items = role === 'admin' ? adminItems : userItems;
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={`bottom-nav-item ${isActive(item.href) ? 'active' : ''}`}
        >
          <item.icon />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
