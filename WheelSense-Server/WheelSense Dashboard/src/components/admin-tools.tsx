import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { apiService } from '../services/api';
import { AlertCircle, Trash2, CheckCircle2, Calendar, Zap } from 'lucide-react';
import { toast } from 'sonner';

export function AdminTools() {
  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [scope, setScope] = useState<'sensor' | 'labels' | 'layout' | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleClear = async () => {
    // Validation
    const hasDate = date.trim().length > 0;
    const hasRange = start.trim().length > 0 && end.trim().length > 0;
    
    if (!hasDate && !hasRange) {
      toast.error('Please provide either a date or date range');
      setError('Please provide either a date or start+end dates');
      return;
    }

    if (hasDate && hasRange) {
      toast.error('Please provide either date OR date range, not both');
      setError('Provide either date OR date range, not both');
      return;
    }

    // Confirm action
    const confirmed = window.confirm(
      `Are you sure you want to clear ${scope} data?\n\n` +
      (hasDate ? `Date: ${date}` : `Range: ${start} to ${end}`) +
      `\n\nThis action cannot be undone!`
    );

    if (!confirmed) return;

    setLoading(true);
    setResult(null);
    setError(null);
    
    try {
      const params: any = { scope };
      if (hasDate) {
        params.date = date;
      } else {
        params.start = start;
        params.end = end;
      }

      const resp = await apiService.clearData(params);
      const message = `Successfully cleared ${resp.affected} rows (scope: ${scope})`;
      setResult(message);
      toast.success(message, {
        description: hasDate ? `Date: ${date}` : `Range: ${start} to ${end}`,
      });

      // Clear form
      setDate('');
      setStart('');
      setEnd('');
    } catch (e: any) {
      const errorMsg = e?.message || 'Failed to clear data';
      setError(errorMsg);
      toast.error('Failed to clear data', {
        description: errorMsg,
      });
    } finally {
      setLoading(false);
    }
  };

  // Quick action: Clear today's sensor data
  const handleClearToday = async () => {
    const confirmed = window.confirm(
      "Clear all sensor data from today?\n\nThis action cannot be undone!"
    );
    if (!confirmed) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const today = new Date().toISOString().split('T')[0];
      const resp = await apiService.clearData({ scope: 'sensor', date: today });
      const message = `Cleared ${resp.affected} sensor readings from today`;
      setResult(message);
      toast.success(message);
    } catch (e: any) {
      const errorMsg = e?.message || 'Failed to clear data';
      setError(errorMsg);
      toast.error('Failed to clear data', { description: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  // Quick action: Clear last 7 days
  const handleClearLastWeek = async () => {
    const confirmed = window.confirm(
      "Clear all sensor data from the last 7 days?\n\nThis action cannot be undone!"
    );
    if (!confirmed) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const end = new Date().toISOString().split('T')[0];
      const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const resp = await apiService.clearData({ scope: 'sensor', start, end });
      const message = `Cleared ${resp.affected} sensor readings from last 7 days`;
      setResult(message);
      toast.success(message);
    } catch (e: any) {
      const errorMsg = e?.message || 'Failed to clear data';
      setError(errorMsg);
      toast.error('Failed to clear data', { description: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  // Quick action: Clear all data
  const handleClearAll = async () => {
    const confirmed = window.confirm(
      "⚠️ WARNING: Clear ALL data (sensors, labels, layout)?\n\nThis will reset the entire database!\n\nThis action cannot be undone!"
    );
    if (!confirmed) return;

    const doubleConfirm = window.confirm(
      "Are you ABSOLUTELY sure? Type YES to confirm."
    );
    if (!doubleConfirm) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const today = new Date().toISOString().split('T')[0];
      const resp = await apiService.clearData({ scope: 'all', date: today });
      const message = `Database cleared: ${resp.affected} records deleted`;
      setResult(message);
      toast.success(message);
    } catch (e: any) {
      const errorMsg = e?.message || 'Failed to clear data';
      setError(errorMsg);
      toast.error('Failed to clear data', { description: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full bg-[#fafafa]">
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h2 className="english-text text-[#0056B3]">Admin Tools</h2>
          <p className="thai-text text-muted-foreground">เครื่องมือผู้ดูแลระบบ</p>
        </div>

        {/* Quick Actions */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-blue-600" />
              <span className="english-text">Quick Actions</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button
                onClick={handleClearToday}
                disabled={loading}
                variant="outline"
                className="h-auto flex-col items-start p-4 hover:bg-blue-50"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <span className="font-semibold">Clear Today</span>
                </div>
                <p className="text-xs text-muted-foreground text-left">
                  Remove all sensor data from today
                </p>
              </Button>

              <Button
                onClick={handleClearLastWeek}
                disabled={loading}
                variant="outline"
                className="h-auto flex-col items-start p-4 hover:bg-amber-50"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4 text-amber-600" />
                  <span className="font-semibold">Clear Last 7 Days</span>
                </div>
                <p className="text-xs text-muted-foreground text-left">
                  Remove sensor data from the last week
                </p>
              </Button>

              <Button
                onClick={handleClearAll}
                disabled={loading}
                variant="outline"
                className="h-auto flex-col items-start p-4 hover:bg-red-50 border-red-300"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Trash2 className="h-4 w-4 text-red-600" />
                  <span className="font-semibold text-red-700">Clear All Data</span>
                </div>
                <p className="text-xs text-muted-foreground text-left">
                  ⚠️ Reset entire database
                </p>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Advanced Options */}
        <Card className="border-l-4 border-l-red-500">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-red-600" />
                <div>
                  <span className="english-text text-red-700">Advanced Clear Options</span>
                  <p className="text-sm text-muted-foreground font-normal mt-1">
                    Custom date ranges and data scopes
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? 'Hide' : 'Show'}
              </Button>
            </CardTitle>
          </CardHeader>
          {showAdvanced && (
            <CardContent className="space-y-6">
            {/* Date Selection */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Select Date Range
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="date" className="flex items-center gap-1">
                    Single Date
                    <span className="text-xs text-muted-foreground">(OR)</span>
                  </Label>
                  <Input 
                    id="date" 
                    type="date"
                    value={date} 
                    onChange={(e) => {
                      setDate(e.target.value);
                      setStart('');
                      setEnd('');
                      setError(null);
                    }} 
                  />
                </div>
                <div>
                  <Label htmlFor="start" className="flex items-center gap-1">
                    Start Date
                    <span className="text-xs text-muted-foreground">(Range)</span>
                  </Label>
                  <Input 
                    id="start" 
                    type="date"
                    value={start} 
                    onChange={(e) => {
                      setStart(e.target.value);
                      setDate('');
                      setError(null);
                    }} 
                  />
                </div>
                <div>
                  <Label htmlFor="end">End Date</Label>
                  <Input 
                    id="end" 
                    type="date"
                    value={end} 
                    onChange={(e) => {
                      setEnd(e.target.value);
                      setDate('');
                      setError(null);
                    }} 
                  />
                </div>
              </div>
            </div>

            {/* Scope Selection */}
            <div>
              <Label htmlFor="scope">Data Scope</Label>
              <Select value={scope} onValueChange={(value) => setScope(value as any)}>
                <SelectTrigger className="w-full md:w-[300px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">🗑️ All Data</SelectItem>
                  <SelectItem value="sensor">📊 Sensor Data Only</SelectItem>
                  <SelectItem value="labels">🏷️ Labels Only</SelectItem>
                  <SelectItem value="layout">🗺️ Map Layout Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Warning */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold mb-1">Important:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Provide either a single date OR a date range (not both)</li>
                  <li>This action cannot be undone</li>
                  <li>You will be asked to confirm before deletion</li>
                </ul>
              </div>
            </div>

            {/* Action Button */}
            <div className="flex items-center gap-4">
              <Button 
                onClick={handleClear} 
                disabled={loading}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {loading ? 'Clearing...' : 'Clear Data'}
              </Button>
              
              {loading && (
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="animate-spin">⏳</span>
                  Processing...
                </span>
              )}
            </div>

            {/* Result Messages */}
            {result && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div className="text-sm text-green-800">
                  <p className="font-semibold">{result}</p>
                </div>
              </div>
            )}
            
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                <div className="text-sm text-red-800">
                  <p className="font-semibold">Error:</p>
                  <p>{error}</p>
                </div>
              </div>
            )}
            </CardContent>
          )}
        </Card>

        {/* Result Messages (global) */}
        {result && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
            <div className="text-sm text-green-800">
              <p className="font-semibold">{result}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}







