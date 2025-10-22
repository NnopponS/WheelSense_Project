import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { apiService } from '../services/api';
import { AlertCircle, Trash2 } from 'lucide-react';

export function AdminTools() {
  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [scope, setScope] = useState<'sensor' | 'labels' | 'layout' | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClear = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const resp = await apiService.clearData({ date, start, end, scope });
      setResult(`Cleared ${resp.affected} rows in scope: ${scope}`);
    } catch (e: any) {
      setError(e?.message || 'Failed to clear data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full bg-[#fafafa]">
      <div className="container mx-auto p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              <span className="english-text">Admin Tools: Clear Database</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="date">Date (YYYY-MM-DD)</Label>
                <Input id="date" placeholder="2025-10-21" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="start">Start (YYYY-MM-DD)</Label>
                <Input id="start" placeholder="2025-10-20" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="end">End (YYYY-MM-DD)</Label>
                <Input id="end" placeholder="2025-10-21" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <Label htmlFor="scope">Scope</Label>
                <select id="scope" className="border rounded-md h-10 px-3"
                  value={scope} onChange={(e) => setScope(e.target.value as any)}>
                  <option value="all">All</option>
                  <option value="sensor">Sensor data</option>
                  <option value="labels">Labels</option>
                  <option value="layout">Layout</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleClear} disabled={loading} className="bg-red-600 hover:bg-red-700">
                  {loading ? 'Clearing...' : 'Clear'}
                </Button>
                <div className="flex items-center text-xs text-muted-foreground gap-1">
                  <AlertCircle className="h-4 w-4" />
                  Provide either Date or Start+End.
                </div>
              </div>
            </div>

            {result && <div className="text-green-700 text-sm">{result}</div>}
            {error && <div className="text-red-600 text-sm">{error}</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}






