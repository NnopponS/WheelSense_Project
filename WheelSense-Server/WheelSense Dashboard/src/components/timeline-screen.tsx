import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Calendar, Download, Clock, MapPin, Activity, TrendingUp, Send, Bot } from 'lucide-react';
import { toast } from 'sonner';

interface TimelineEntry {
  time: string;
  room: string;
  duration_min: number;
  dist_m: number;
  avg_rssi: number;
}

// Timeline data will be fetched from API
const emptyData = {
  date: new Date().toISOString().split('T')[0],
  wheelchairId: '',
  entries: [] as TimelineEntry[],
  totals: {
    moving_min: 0,
    distance_m: 0,
    rooms_visited: 0,
    alerts: 0,
  },
};

export function TimelineScreen() {
  const [selectedEntry, setSelectedEntry] = useState<TimelineEntry | null>(null);
  const [selectedWheelchair, setSelectedWheelchair] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [timelineData, setTimelineData] = useState(emptyData);
  const [availableWheelchairs] = useState<string[]>([]); // To be populated from API

  const exportData = (format: 'csv' | 'json') => {
    if (format === 'json') {
      const dataStr = JSON.stringify(timelineData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wheelsense-timeline-${selectedDate}.json`;
      link.click();
      toast.success('Timeline exported as JSON');
    } else {
      let csv = 'Time,Room,Duration (min),Distance (m),Avg RSSI\n';
      timelineData.entries.forEach((entry) => {
        csv += `${entry.time},${entry.room},${entry.duration_min},${entry.dist_m},${entry.avg_rssi}\n`;
      });
      const dataBlob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wheelsense-timeline-${selectedDate}.csv`;
      link.click();
      toast.success('Timeline exported as CSV');
    }
  };

  const sendToAI = () => {
    // AI analysis based on real data
    setShowAIDialog(true);
    setAiAnalysis('Analyzing timeline data...');
    
    setTimeout(() => {
      if (timelineData.entries.length === 0) {
        setAiAnalysis('No timeline data available for analysis. Please ensure there is activity data for the selected date and wheelchair.');
        return;
      }

      const avgRSSI = timelineData.entries.length > 0
        ? (timelineData.entries.reduce((sum, e) => sum + e.avg_rssi, 0) / timelineData.entries.length).toFixed(1)
        : '0';
      
      const mostTimeEntry = timelineData.entries.reduce((max, e) => e.duration_min > max.duration_min ? e : max, timelineData.entries[0]);
      const bestSignalEntry = timelineData.entries.reduce((max, e) => e.avg_rssi > max.avg_rssi ? e : max, timelineData.entries[0]);
      const weakestSignalEntry = timelineData.entries.reduce((min, e) => e.avg_rssi < min.avg_rssi ? e : min, timelineData.entries[0]);

      const analysis = `📊 AI Analysis for ${selectedWheelchair} on ${selectedDate}

🎯 Activity Summary:
• Total moving time: ${timelineData.totals.moving_min} minutes (${(timelineData.totals.moving_min / 60).toFixed(1)} hours)
• Total distance covered: ${timelineData.totals.distance_m} meters
• Rooms visited: ${timelineData.totals.rooms_visited} different locations
• Alerts: ${timelineData.totals.alerts}

📍 Location Patterns:
• Most time spent: ${mostTimeEntry.room} (${mostTimeEntry.duration_min} min)
• Activity locations: ${timelineData.entries.map(e => e.room).join(', ')}

🔋 Signal Strength Analysis:
• Average RSSI: ${avgRSSI} dBm
• Best signal: ${bestSignalEntry.room} (${bestSignalEntry.avg_rssi} dBm)
• Weakest signal: ${weakestSignalEntry.room} (${weakestSignalEntry.avg_rssi} dBm)

💡 Insights & Recommendations:
1. ${timelineData.totals.moving_min > 180 ? 'High activity level detected' : 'Moderate activity level'}
2. ${timelineData.totals.alerts > 0 ? `${timelineData.totals.alerts} signal alerts detected - consider signal improvements` : 'No connectivity issues detected'}
3. Movement pattern suggests ${timelineData.totals.rooms_visited > 5 ? 'high mobility' : 'normal daily activities'}

✅ Overall Status: ${timelineData.totals.alerts === 0 ? 'Normal system performance' : 'Some signal issues detected'}`;
      
      setAiAnalysis(analysis);
    }, 2000);
  };

  return (
    <div className="h-full bg-[#fafafa]">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="english-text text-[#0056B3]">Timeline (Today)</h2>
            <p className="thai-text text-muted-foreground">ไทม์ไลน์กิจกรรมประจำวัน</p>
          </div>
        </div>

        {/* Filter Bar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="text-sm text-muted-foreground mb-2 block english-text">
                  Date
                </label>
                <Select value={selectedDate} onValueChange={setSelectedDate}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={new Date().toISOString().split('T')[0]}>
                      {new Date().toISOString().split('T')[0]} (Today)
                    </SelectItem>
                    <SelectItem value={new Date(Date.now() - 86400000).toISOString().split('T')[0]}>
                      {new Date(Date.now() - 86400000).toISOString().split('T')[0]}
                    </SelectItem>
                    <SelectItem value={new Date(Date.now() - 172800000).toISOString().split('T')[0]}>
                      {new Date(Date.now() - 172800000).toISOString().split('T')[0]}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 min-w-[200px]">
                <label className="text-sm text-muted-foreground mb-2 block english-text">
                  Wheelchair ID
                </label>
                <Select value={selectedWheelchair} onValueChange={setSelectedWheelchair}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select wheelchair" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableWheelchairs.length === 0 ? (
                      <SelectItem value="" disabled>No wheelchairs available</SelectItem>
                    ) : (
                      availableWheelchairs.map(id => (
                        <SelectItem key={id} value={id}>{id}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 min-w-[200px]">
                <label className="text-sm text-muted-foreground mb-2 block english-text">
                  Floor
                </label>
                <Select defaultValue="floor-1">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="floor-1">Floor 1</SelectItem>
                    <SelectItem value="floor-2">Floor 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => exportData('csv')}
                  className="english-text"
                >
                  <Download className="mr-2 h-4 w-4" />
                  CSV
                </Button>
                <Button
                  variant="outline"
                  onClick={() => exportData('json')}
                  className="english-text"
                >
                  <Download className="mr-2 h-4 w-4" />
                  JSON
                </Button>
                <Button
                  onClick={sendToAI}
                  className="bg-[#00945E] hover:bg-[#007a4d] text-white english-text"
                >
                  <Bot className="mr-2 h-4 w-4" />
                  AI Analysis
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Timeline List */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="english-text">Activity Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px] pr-4">
                  <div className="relative">
                    {/* Vertical line */}
                    <div className="absolute left-[15px] top-0 bottom-0 w-0.5 bg-border" />

                    <div className="space-y-6">
                      {timelineData.entries.map((entry, idx) => (
                        <div
                          key={idx}
                          className="relative pl-12 cursor-pointer hover:bg-accent/50 p-3 rounded-lg transition-colors"
                          onClick={() => setSelectedEntry(entry)}
                        >
                          {/* Timeline dot */}
                          <div className="absolute left-[7px] top-[20px] w-4 h-4 rounded-full bg-[#0056B3] border-4 border-white shadow-md" />

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Badge className="bg-[#0056B3] text-white">
                                  <Clock className="mr-1 h-3 w-3" />
                                  {entry.time}
                                </Badge>
                                <h4 className="english-text text-[#00945E]">{entry.room}</h4>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Clock className="h-4 w-4" />
                                <span className="english-text">
                                  {entry.duration_min} min
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <TrendingUp className="h-4 w-4" />
                                <span className="english-text">{entry.dist_m}m</span>
                              </div>
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Activity className="h-4 w-4" />
                                <span className="english-text">{entry.avg_rssi} dBm</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Summary Card (Sticky) */}
          <div className="lg:col-span-1">
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="english-text">Daily Summary</CardTitle>
                <p className="thai-text text-sm text-muted-foreground">สรุปกิจกรรมประจำวัน</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-[#e8f4ff] rounded-lg">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-[#0056B3]" />
                      <span className="english-text text-sm">Total Distance</span>
                    </div>
                    <span className="text-[#0056B3]">{timelineData.totals.distance_m}m</span>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-[#f0fdf4] rounded-lg">
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-[#00945E]" />
                      <span className="english-text text-sm">Moving Time</span>
                    </div>
                    <span className="text-[#00945E]">{timelineData.totals.moving_min} min</span>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-[#fef3c7] rounded-lg">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-[#f59e0b]" />
                      <span className="english-text text-sm">Rooms Visited</span>
                    </div>
                    <span className="text-[#f59e0b]">{timelineData.totals.rooms_visited}</span>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gray-100 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-gray-600" />
                      <span className="english-text text-sm">Alerts</span>
                    </div>
                    <span className="text-gray-600">{timelineData.totals.alerts}</span>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="text-sm mb-3 english-text">Room Distribution</h4>
                  <div className="space-y-2">
                    {timelineData.entries.map((entry, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#0056B3]" />
                        <span className="text-sm flex-1 english-text">{entry.room}</span>
                        <span className="text-xs text-muted-foreground">
                          {entry.duration_min}min
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Route Path Dialog */}
        <Dialog open={selectedEntry !== null} onOpenChange={() => setSelectedEntry(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-[#0056B3]">
                <span className="english-text">Route Visualization</span>
                {selectedEntry && (
                  <>
                    {' '}
                    - {selectedEntry.room} ({selectedEntry.time})
                  </>
                )}
              </DialogTitle>
            </DialogHeader>
            {selectedEntry && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-sm text-muted-foreground english-text">Duration</div>
                      <div className="text-xl text-[#0056B3]">{selectedEntry.duration_min} min</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-sm text-muted-foreground english-text">Distance</div>
                      <div className="text-xl text-[#00945E]">{selectedEntry.dist_m}m</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-sm text-muted-foreground english-text">Avg RSSI</div>
                      <div className="text-xl">{selectedEntry.avg_rssi} dBm</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Mini Map with Dot Trail */}
                <Card>
                  <CardContent className="p-4">
                    <div className="w-full h-[300px] bg-gray-50 rounded-lg flex items-center justify-center">
                      <svg width="100%" height="100%" viewBox="0 0 400 300">
                        {/* Room outline */}
                        <rect
                          x="50"
                          y="50"
                          width="300"
                          height="200"
                          fill="#e8f4ff"
                          stroke="#0056B3"
                          strokeWidth="2"
                          rx="8"
                        />
                        <text
                          x="200"
                          y="30"
                          textAnchor="middle"
                          className="english-text"
                          fill="#0056B3"
                        >
                          {selectedEntry.room}
                        </text>

                        {/* Simulated path trail */}
                        {Array.from({ length: 15 }, (_, i) => {
                          const t = i / 14;
                          const x = 80 + Math.sin(t * Math.PI * 2) * 40 + t * 200;
                          const y = 150 + Math.cos(t * Math.PI * 3) * 30;
                          return (
                            <circle
                              key={i}
                              cx={x}
                              cy={y}
                              r="4"
                              fill="#0056B3"
                              opacity={0.3 + t * 0.7}
                            />
                          );
                        })}

                        {/* End position */}
                        <circle cx="280" cy="150" r="10" fill="#00945E" />
                        <text
                          x="280"
                          y="155"
                          textAnchor="middle"
                          fill="white"
                          fontSize="12"
                        >
                          ♿
                        </text>
                      </svg>
                    </div>
                  </CardContent>
                </Card>

                <p className="text-sm text-muted-foreground text-center english-text">
                  * This is a simulated route visualization based on movement data
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* AI Analysis Dialog */}
        <Dialog open={showAIDialog} onOpenChange={setShowAIDialog}>
          <DialogContent className="max-w-3xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-[#0056B3]">
                <Bot className="h-6 w-6" />
                <div>
                  <span className="english-text">AI Timeline Analysis</span>
                  <p className="thai-text text-sm text-muted-foreground">การวิเคราะห์ไทม์ไลน์โดย AI</p>
                </div>
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <Card className="bg-gradient-to-br from-[#e8f4ff] to-white border-[#0056B3]">
                <CardContent className="p-6">
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {aiAnalysis}
                  </pre>
                </CardContent>
              </Card>
            </ScrollArea>
            <div className="flex gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  const dataStr = JSON.stringify({
                    timeline: timelineData,
                    analysis: aiAnalysis,
                  }, null, 2);
                  const dataBlob = new Blob([dataStr], { type: 'application/json' });
                  const url = URL.createObjectURL(dataBlob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `wheelsense-ai-analysis-${selectedDate}.json`;
                  link.click();
                  toast.success('AI analysis exported');
                }}
                className="flex-1"
              >
                <Download className="mr-2 h-4 w-4" />
                <span className="english-text">Export Analysis</span>
              </Button>
              <Button
                onClick={() => setShowAIDialog(false)}
                className="flex-1 bg-[#0056B3] hover:bg-[#004494]"
              >
                <span className="english-text">Close</span>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
