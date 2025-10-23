import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { MonitoringDashboard } from './components/monitoring-dashboard';
import { AIAssistantChat } from './components/ai-assistant-chat';
import { TimelineScreen } from './components/timeline-screen';
import { DeviceSetupScreen } from './components/device-setup-screen';
import { MapEditor } from './components/map-editor';
import { AdminTools } from './components/admin-tools';
import { NetworkTopology } from './components/network-topology';
import { ReportsScreen } from './components/reports-screen';
import { AnalyticsDashboard } from './components/analytics-dashboard';

function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Listen for custom navigation events from components
  useEffect(() => {
    const handleNavigate = (event: CustomEvent) => {
      if (event.detail === 'map-layout') {
        navigate('/map');
      } else if (event.detail === 'dashboard') {
        navigate('/');
      }
    };
    
    window.addEventListener('navigate', handleNavigate as EventListener);
    return () => window.removeEventListener('navigate', handleNavigate as EventListener);
  }, [navigate]);
  
  const isActive = (path: string) => location.pathname === path;
  
  const linkClass = (path: string) => 
    `px-6 py-3 border-b-2 transition-colors ${
      isActive(path) 
        ? 'border-[#0056B3] text-[#0056B3] bg-blue-50' 
        : 'border-transparent hover:border-gray-300 hover:bg-gray-50'
    }`;

  return (
    <div className="border-b bg-white sticky top-0 z-50">
      <div className="container mx-auto">
        <div className="flex items-center justify-between py-4 px-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#0056B3] to-[#00945E] flex items-center justify-center">
              <span className="text-white font-bold">W</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#0056B3]">WheelSense</h1>
              <p className="text-xs text-muted-foreground">Smart Indoor Navigation</p>
            </div>
          </div>
        </div>
        <nav className="flex overflow-x-auto">
          <Link to="/" className={linkClass('/')}>
            <span className="english-text">Dashboard</span>
          </Link>
          <Link to="/analytics" className={linkClass('/analytics')}>
            <span className="english-text">Analytics</span>
          </Link>
          <Link to="/network" className={linkClass('/network')}>
            <span className="english-text">Network</span>
          </Link>
          <Link to="/reports" className={linkClass('/reports')}>
            <span className="english-text">Reports</span>
          </Link>
          <Link to="/timeline" className={linkClass('/timeline')}>
            <span className="english-text">Timeline</span>
          </Link>
          <Link to="/devices" className={linkClass('/devices')}>
            <span className="english-text">Devices</span>
          </Link>
          <Link to="/map" className={linkClass('/map')}>
            <span className="english-text">Map Editor</span>
          </Link>
          <Link to="/assistant" className={linkClass('/assistant')}>
            <span className="english-text">AI</span>
          </Link>
          <Link to="/admin" className={linkClass('/admin')}>
            <span className="english-text">Admin</span>
          </Link>
        </nav>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <div className="size-full bg-background flex flex-col">
        <Navigation />
        <div className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<MonitoringDashboard />} />
            <Route path="/analytics" element={<AnalyticsDashboard />} />
            <Route path="/network" element={<NetworkTopology />} />
            <Route path="/reports" element={<ReportsScreen />} />
            <Route path="/timeline" element={<TimelineScreen />} />
            <Route path="/devices" element={<DeviceSetupScreen />} />
            <Route path="/map" element={<MapEditor />} />
            <Route path="/assistant" element={<AIAssistantChat />} />
            <Route path="/admin" element={<AdminTools />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}
