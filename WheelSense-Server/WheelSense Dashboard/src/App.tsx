import { useState } from 'react';
import { MonitoringDashboard } from './components/monitoring-dashboard';
import { AIAssistantChat } from './components/ai-assistant-chat';
import { TimelineScreen } from './components/timeline-screen';
import { DeviceSetupScreen } from './components/device-setup-screen';
import { MapLayoutEditor } from './components/map-layout-editor';
import { AdminTools } from './components/admin-tools';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="size-full bg-background">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="size-full flex flex-col">
        <div className="border-b bg-white sticky top-0 z-50">
          <div className="container mx-auto">
            <div className="flex items-center justify-between py-4 px-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#0056B3] to-[#00945E] flex items-center justify-center">
                  <span className="text-white">W</span>
                </div>
                <div>
                  <h1 className="text-[#0056B3]">WheelSense</h1>
                  <p className="text-xs text-muted-foreground">Smart Indoor Navigation</p>
                </div>
              </div>
            </div>
            <TabsList className="w-full justify-start rounded-none border-0 bg-transparent p-0 h-auto">
              <TabsTrigger 
                value="dashboard" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#0056B3] data-[state=active]:bg-transparent px-6 py-3"
              >
                <span className="english-text">Dashboard</span>
              </TabsTrigger>
              <TabsTrigger 
                value="timeline" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#0056B3] data-[state=active]:bg-transparent px-6 py-3"
              >
                <span className="english-text">Timeline</span>
              </TabsTrigger>
              <TabsTrigger 
                value="devices" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#0056B3] data-[state=active]:bg-transparent px-6 py-3"
              >
                <span className="english-text">Devices & Routes</span>
              </TabsTrigger>
              <TabsTrigger 
                value="map" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#0056B3] data-[state=active]:bg-transparent px-6 py-3"
              >
                <span className="english-text">Map Layout</span>
              </TabsTrigger>
              <TabsTrigger 
                value="assistant" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#0056B3] data-[state=active]:bg-transparent px-6 py-3"
              >
                <span className="english-text">AI Assistant</span>
              </TabsTrigger>
              <TabsTrigger 
                value="admin" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#0056B3] data-[state=active]:bg-transparent px-6 py-3"
              >
                <span className="english-text">Admin</span>
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto">
          <TabsContent value="dashboard" className="m-0 h-full">
            <MonitoringDashboard />
          </TabsContent>
          <TabsContent value="timeline" className="m-0 h-full">
            <TimelineScreen />
          </TabsContent>
          <TabsContent value="devices" className="m-0 h-full">
            <DeviceSetupScreen />
          </TabsContent>
          <TabsContent value="map" className="m-0 h-full">
            <MapLayoutEditor />
          </TabsContent>
          <TabsContent value="assistant" className="m-0 h-full flex items-center justify-center">
            <AIAssistantChat />
          </TabsContent>
          <TabsContent value="admin" className="m-0 h-full">
            <AdminTools />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
