import React, { useEffect } from 'react';
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
import { UserHomePage, UserHealthPage, UserLocationPage, UserAlertsPage, UserVideoPage } from './pages/UserPages';
import { EmergencyBanner } from './components/EmergencyBanner';
import { preloadTranslator } from './services/i18n';

function AppContent() {
    const { currentPage, role, emergencies, compactMode, language } = useApp();

    const hasActiveEmergency = emergencies.some(e => !e.resolved);

    // Preload translator when language is Thai (for EN->TH translation)
    useEffect(() => {
        console.log('[AppContent] Language:', language);
        if (language === 'th') {
            console.log('[AppContent] Preloading translator for TH mode...');
            preloadTranslator();
        }
    }, [language]);

    const renderPage = () => {
        // Admin pages
        if (role === 'admin') {
            switch (currentPage) {
                case 'monitoring': return <MonitoringPage />;
                case 'map': return <MapPage />;
                case 'patients': return <PatientsPage />;
                case 'devices': return <DevicesPage />;
                case 'timeline': return <TimelinePage />;
                case 'routines': return <RoutinesPage />;
                case 'analytics': return <AnalyticsPage />;
                case 'appliances': return <ApplianceControlPage />;
                case 'ai': return <AIAssistantPage />;
                case 'settings': return <SettingsPage />;
                case 'more': return <MorePage />;
                default: return <MonitoringPage />;
            }
        }

        // User pages
        switch (currentPage) {
            case 'user-home': return <UserHomePage />;
            case 'user-location': return <UserLocationPage />;
            case 'user-health': return <UserHealthPage />;
            case 'user-routines': return <RoutinesPage />;
            case 'user-appliances': return <ApplianceControlPage />;
            case 'user-ai': return <AIAssistantPage />;
            case 'user-alerts': return <UserAlertsPage />;
            case 'user-video': return <UserVideoPage />;
            case 'user-settings': return <SettingsPage />;
            case 'more': return <MorePage />;
            default: return <UserHomePage />;
        }
    };

    return (
        <div className="app-container">
            <Sidebar />
            <main className="main-content">
                <TopBar />
                {hasActiveEmergency && role === 'admin' && <EmergencyBanner />}
                {renderPage()}
            </main>
            <BottomNav />
            <Drawer />
            <AIChatPopup />
        </div>
    );
}

// User Routines Page (simplified version for users)
function UserRoutinesPage() {
    const { routines, currentUser, updateRoutine } = useApp();

    const myRoutines = routines.filter(r => r.patientId === currentUser.id);
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
