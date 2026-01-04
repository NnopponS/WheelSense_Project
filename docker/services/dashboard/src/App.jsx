import React, { useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar, BottomNav } from './components/Navigation';
import { TopBar } from './components/TopBar';
import { Drawer } from './components/Drawer';
import { AIChatPopup } from './components/AIChatPopup';
import { MonitoringPage } from './pages/MonitoringPage';
import { PatientsPage } from './pages/PatientsPage';
import { DevicesPage } from './pages/DevicesPage';
import { TimelinePage } from './pages/TimelinePage';
import { RoutinesPage } from './pages/RoutinesPage';
import { AIAssistantPage } from './pages/AIAssistantPage';
import { SettingsPage } from './pages/SettingsPage';
import { MapPage } from './pages/MapPage';
import { MorePage } from './pages/MorePage';
import { ApplianceControlPage } from './pages/AppliancePage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SensorMonitoringPage } from './pages/SensorMonitoringPage';
import { UserHomePage, UserHealthPage, UserLocationPage, UserAlertsPage, UserVideoPage } from './pages/UserPages';

import { EmergencyBanner } from './components/EmergencyBanner';
import { Modal } from './components/Modal';

// Route configuration for admin pages
const adminRoutes = [
    { path: '/Admin/Monitoring', element: <MonitoringPage />, pageId: 'monitoring' },
    { path: '/Admin/MapAndZone', element: <MapPage />, pageId: 'map' },
    { path: '/Admin/Patients', element: <PatientsPage />, pageId: 'patients' },
    { path: '/Admin/Devices', element: <DevicesPage />, pageId: 'devices' },
    { path: '/Admin/Timeline', element: <TimelinePage />, pageId: 'timeline' },
    { path: '/Admin/Routines', element: <RoutinesPage />, pageId: 'routines' },
    { path: '/Admin/Analytics', element: <AnalyticsPage />, pageId: 'analytics' },
    { path: '/Admin/Appliances', element: <ApplianceControlPage />, pageId: 'appliances' },
    { path: '/Admin/Sensors', element: <SensorMonitoringPage />, pageId: 'sensors' },

    { path: '/Admin/AI', element: <AIAssistantPage />, pageId: 'ai' },
    { path: '/Admin/Settings', element: <SettingsPage />, pageId: 'settings' },
    { path: '/Admin/More', element: <MorePage />, pageId: 'more' },
];

// Route configuration for user pages
const userRoutes = [
    { path: '/User/Home', element: <UserHomePage />, pageId: 'user-home' },
    { path: '/User/Location', element: <UserLocationPage />, pageId: 'user-location' },
    { path: '/User/Health', element: <UserHealthPage />, pageId: 'user-health' },
    { path: '/User/Routines', element: <RoutinesPage />, pageId: 'user-routines' },
    { path: '/User/Appliances', element: <ApplianceControlPage />, pageId: 'user-appliances' },
    { path: '/User/Video', element: <UserVideoPage />, pageId: 'user-video' },
    { path: '/User/AI', element: <AIAssistantPage />, pageId: 'user-ai' },
    { path: '/User/Alerts', element: <UserAlertsPage />, pageId: 'user-alerts' },
    { path: '/User/Settings', element: <SettingsPage />, pageId: 'user-settings' },
    { path: '/User/More', element: <MorePage />, pageId: 'more' },
];

// Map internal page IDs to URL paths
export const pageToPath = {
    // Admin pages
    'monitoring': '/Admin/Monitoring',
    'map': '/Admin/MapAndZone',
    'patients': '/Admin/Patients',
    'devices': '/Admin/Devices',
    'timeline': '/Admin/Timeline',
    'routines': '/Admin/Routines',
    'analytics': '/Admin/Analytics',
    'appliances': '/Admin/Appliances',
    'sensors': '/Admin/Sensors',

    'ai': '/Admin/AI',
    'settings': '/Admin/Settings',
    'more': '/Admin/More',
    // User pages
    'user-home': '/User/Home',
    'user-location': '/User/Location',
    'user-health': '/User/Health',
    'user-routines': '/User/Routines',
    'user-appliances': '/User/Appliances',
    'user-video': '/User/Video',
    'user-ai': '/User/AI',
    'user-alerts': '/User/Alerts',
    'user-settings': '/User/Settings',
};

// Map URL paths to internal page IDs
export const pathToPage = Object.fromEntries(
    Object.entries(pageToPath).map(([k, v]) => [v.toLowerCase(), k])
);

// Component to sync URL with context state
function RouteSynchronizer() {
    const { role, setRole, currentPage, setCurrentPage } = useApp();
    const location = useLocation();
    const navigate = useNavigate();
    const isNavigatingRef = useRef(false);

    // Sync URL to context state when URL changes (only when URL actually changes)
    useEffect(() => {
        // Skip if we're in the middle of a navigation we triggered
        if (isNavigatingRef.current) {
            isNavigatingRef.current = false;
            return;
        }

        const path = location.pathname.toLowerCase().replace(/\/$/, '');
        const pageId = pathToPage[path];

        if (pageId && pageId !== currentPage) {
            console.log('[Router] URL changed, syncing to context:', pageId);
            setCurrentPage(pageId);

            // Update role based on path
            if (path.startsWith('/admin')) {
                setRole('admin');
            } else if (path.startsWith('/user')) {
                setRole('user');
            }
        }
    }, [location.pathname]); // Only depend on location.pathname, not currentPage

    // Sync context state to URL when currentPage changes (from Navigation clicks)
    useEffect(() => {
        const expectedPath = pageToPath[currentPage];
        if (!expectedPath) return;

        const currentPath = location.pathname.toLowerCase().replace(/\/$/, '');
        const expectedPathLower = expectedPath.toLowerCase();

        // Only navigate if paths don't match
        if (currentPath !== expectedPathLower) {
            console.log('[Router] Context changed, navigating to:', expectedPath);
            isNavigatingRef.current = true; // Mark that we're navigating
            navigate(expectedPath, { replace: true });
        }
    }, [currentPage, navigate]); // Remove location.pathname from deps to prevent loop

    return null;
}

function AppContent() {
    const { role, emergencies } = useApp();

    const hasActiveEmergency = emergencies.some(e => !e.resolved);

    return (
        <div className="app-container">
            <RouteSynchronizer />
            <Sidebar />
            <main className="main-content">
                <TopBar />
                {hasActiveEmergency && role === 'admin' && <EmergencyBanner />}
                <Routes>
                    {/* Default redirect */}
                    <Route path="/" element={<Navigate to={role === 'admin' ? '/Admin/Monitoring' : '/User/Home'} replace />} />

                    {/* Admin routes */}
                    {adminRoutes.map(route => (
                        <Route key={route.path} path={route.path} element={route.element} />
                    ))}

                    {/* User routes */}
                    {userRoutes.map(route => (
                        <Route key={route.path} path={route.path} element={route.element} />
                    ))}

                    {/* Fallback - redirect to appropriate home based on role */}
                    <Route path="*" element={<Navigate to={role === 'admin' ? '/Admin/Monitoring' : '/User/Home'} replace />} />
                </Routes>
            </main>
            <BottomNav />
            <Drawer />
            <Modal />
            <AIChatPopup />
        </div>
    );
}

// User Routines Page (simplified version for users)
function UserRoutinesPage() {
    const { routines, currentUser, updateRoutine } = useApp();

    const myRoutines = routines.filter(r => r.patientId === currentUser?.id);
    const now = new Date();
    const currentHour = now.getHours();

    return (
        <div className="page-content">
            <div className="page-header">
                <h2>📅 My Schedule</h2>
                <p>Your daily activities</p>
            </div>

            <div className="card">
                <div className="card-body" style={{ padding: 0 }}>
                    <div className="schedule-container" style={{ padding: '0.5rem' }}>
                        {myRoutines.map(routine => {
                            const routineHour = parseInt(routine.time.split(':')[0]);
                            const isCurrent = routineHour === currentHour;
                            const isPast = routineHour < currentHour;

                            return (
                                <div
                                    key={routine.id}
                                    className={`schedule-item ${routine.completed ? 'completed' : ''} ${isCurrent ? 'current' : ''}`}
                                >
                                    <div className="schedule-time">{routine.time}</div>
                                    <div className="schedule-details">
                                        <div className="schedule-title">{routine.title}</div>
                                        <div className="schedule-desc">{routine.description}</div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        className="schedule-checkbox"
                                        checked={routine.completed}
                                        onChange={() => updateRoutine(routine.id, { completed: !routine.completed })}
                                    />
                                </div>
                            );
                        })}
                        {myRoutines.length === 0 && (
                            <div className="empty-state">
                                <p>No schedule activities yet</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function App() {
    return (
        <AppProvider>
            <AppContent />
        </AppProvider>
    );
}

export default App;
