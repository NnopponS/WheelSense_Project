/**
 * Network Topology Visualization
 * แสดง Mesh Network topology แบบ interactive
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { useSensorData } from '../hooks/useApi';
import { Network, Wifi, Activity, AlertCircle, RefreshCw } from 'lucide-react';

interface NetworkNode {
  id: string;
  label: string;
  type: 'gateway' | 'node';
  devices: number;
  avgLatency: number;
  status: 'healthy' | 'warning' | 'error';
}

interface NetworkLink {
  source: string;
  target: string;
  latency: number;
  recovered: boolean;
}

export function NetworkTopology() {
  const { data: sensorData, loading } = useSensorData();
  const [nodes, setNodes] = useState<NetworkNode[]>([]);
  const [links, setLinks] = useState<NetworkLink[]>([]);

  useEffect(() => {
    if (sensorData.length === 0) return;

    // สร้าง network topology จากข้อมูล
    const nodeMap = new Map<string, NetworkNode>();
    const linkSet = new Map<string, NetworkLink>();

    // เพิ่ม Gateway
    nodeMap.set('gateway', {
      id: 'gateway',
      label: 'Gateway',
      type: 'gateway',
      devices: 0,
      avgLatency: 0,
      status: 'healthy',
    });

    // วิเคราะห์ nodes และ routes
    sensorData.forEach(sensor => {
      if (sensor.stale) return;

      const nodeId = `node-${sensor.node}`;
      
      // เพิ่ม/อัพเดท node
      if (!nodeMap.has(nodeId)) {
        nodeMap.set(nodeId, {
          id: nodeId,
          label: sensor.node_label || `Node ${sensor.node}`,
          type: 'node',
          devices: 0,
          avgLatency: 0,
          status: 'healthy',
        });
      }
      
      const node = nodeMap.get(nodeId)!;
      node.devices++;
      
      // คำนวณ avg latency
      if (sensor.route_latency_ms) {
        node.avgLatency = (node.avgLatency * (node.devices - 1) + sensor.route_latency_ms) / node.devices;
      }
      
      // กำหนด status ตาม latency
      if (node.avgLatency > 1000) {
        node.status = 'error';
      } else if (node.avgLatency > 500) {
        node.status = 'warning';
      }

      // สร้าง links จาก route_path
      if (sensor.route_path && sensor.route_path.length > 1) {
        for (let i = 0; i < sensor.route_path.length - 1; i++) {
          const source = sensor.route_path[i];
          const target = sensor.route_path[i + 1];
          const linkId = `${source}-${target}`;

          if (!linkSet.has(linkId)) {
            linkSet.set(linkId, {
              source: source === 'Gateway' ? 'gateway' : `node-${sensor.node}`,
              target: target === 'Gateway' ? 'gateway' : `node-${sensor.node}`,
              latency: sensor.route_latency_ms || 0,
              recovered: sensor.route_recovered || false,
            });
          }
        }
      }
    });

    setNodes(Array.from(nodeMap.values()));
    setLinks(Array.from(linkSet.values()));
  }, [sensorData]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return '#22c55e';
      case 'warning': return '#eab308';
      case 'error': return '#ef4444';
      default: return '#9ca3af';
    }
  };

  const getLatencyColor = (latency: number) => {
    if (latency < 500) return 'text-green-600';
    if (latency < 1000) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading && nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-[#0056B3]" />
          <p className="text-xl">Loading Network...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#fafafa] overflow-auto">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-semibold text-gray-900">
            <Network className="h-6 w-6 text-gray-400" />
            Network Topology
          </h2>
          <p className="text-sm text-gray-500 mt-1">Mesh Network Visualization</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border border-gray-200">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-4">
                <Network className="h-5 w-5 text-gray-400" />
              </div>
              <div className="text-3xl font-light text-gray-900 mb-1">
                {nodes.length}
              </div>
              <p className="text-sm text-gray-500">Total Nodes</p>
            </CardContent>
          </Card>

          <Card className="border border-gray-200">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-4">
                <Activity className="h-5 w-5 text-gray-400" />
              </div>
              <div className="text-3xl font-light text-gray-900 mb-1">
                {nodes.filter(n => n.status === 'healthy').length}
              </div>
              <p className="text-sm text-gray-500">Healthy Nodes</p>
            </CardContent>
          </Card>

          <Card className="border border-gray-200">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-4">
                <Wifi className="h-5 w-5 text-gray-400" />
              </div>
              <div className="text-3xl font-light text-gray-900 mb-1">
                {links.length}
              </div>
              <p className="text-sm text-gray-500">Connections</p>
            </CardContent>
          </Card>

          <Card className="border border-gray-200">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-4">
                <AlertCircle className="h-5 w-5 text-gray-400" />
                {nodes.filter(n => n.status !== 'healthy').length > 0 && (
                  <div className="h-2 w-2 bg-yellow-500 rounded-full animate-pulse" />
                )}
              </div>
              <div className="text-3xl font-light text-gray-900 mb-1">
                {nodes.filter(n => n.status !== 'healthy').length}
              </div>
              <p className="text-sm text-gray-500">Issues</p>
            </CardContent>
          </Card>
        </div>

        {/* Topology Visualization */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Graph */}
          <Card className="lg:col-span-2 border border-gray-200">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-base font-medium">Network Graph</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="bg-white rounded border border-gray-100">
                <svg width="100%" height="400" viewBox="0 0 600 400">
                  <defs>
                    <marker
                      id="arrowhead"
                      markerWidth="10"
                      markerHeight="10"
                      refX="9"
                      refY="3"
                      orient="auto"
                    >
                      <polygon points="0 0, 10 3, 0 6" fill="#9ca3af" />
                    </marker>
                  </defs>
                  
                  {/* Background */}
                  <rect width="600" height="400" fill="#fafafa" />

                  {/* Links */}
                  {links.map((link, idx) => {
                    const sourceNode = nodes.find(n => n.id === link.source);
                    const targetNode = nodes.find(n => n.id === link.target);
                    
                    if (!sourceNode || !targetNode) return null;

                    // คำนวณตำแหน่ง (simple layout)
                    const sourceX = sourceNode.type === 'gateway' ? 300 : 150 + (nodes.indexOf(sourceNode) * 150);
                    const sourceY = sourceNode.type === 'gateway' ? 50 : 200;
                    const targetX = targetNode.type === 'gateway' ? 300 : 150 + (nodes.indexOf(targetNode) * 150);
                    const targetY = targetNode.type === 'gateway' ? 50 : 200;

                    return (
                      <g key={idx}>
                        <line
                          x1={sourceX}
                          y1={sourceY}
                          x2={targetX}
                          y2={targetY}
                          stroke={link.recovered ? '#f59e0b' : '#d1d5db'}
                          strokeWidth="2"
                          markerEnd="url(#arrowhead)"
                        />
                        {/* Latency label */}
                        <text
                          x={(sourceX + targetX) / 2}
                          y={(sourceY + targetY) / 2 - 5}
                          textAnchor="middle"
                          className="text-xs fill-gray-500"
                        >
                          {link.latency}ms
                        </text>
                      </g>
                    );
                  })}

                  {/* Nodes */}
                  {nodes.map((node, idx) => {
                    const x = node.type === 'gateway' ? 300 : 150 + (idx * 150);
                    const y = node.type === 'gateway' ? 50 : 200;

                    return (
                      <g key={node.id}>
                        {/* Node circle */}
                        <circle
                          cx={x}
                          cy={y}
                          r={node.type === 'gateway' ? 30 : 25}
                          fill="white"
                          stroke={getStatusColor(node.status)}
                          strokeWidth="3"
                        />
                        
                        {/* Icon */}
                        <text
                          x={x}
                          y={y + 5}
                          textAnchor="middle"
                          className="text-2xl"
                        >
                          {node.type === 'gateway' ? '🌐' : '📡'}
                        </text>

                        {/* Label */}
                        <text
                          x={x}
                          y={y + (node.type === 'gateway' ? 50 : 45)}
                          textAnchor="middle"
                          className="text-sm font-medium fill-gray-700"
                        >
                          {node.label}
                        </text>

                        {/* Device count */}
                        {node.devices > 0 && (
                          <text
                            x={x}
                            y={y + (node.type === 'gateway' ? 65 : 60)}
                            textAnchor="middle"
                            className="text-xs fill-gray-500"
                          >
                            {node.devices} device{node.devices > 1 ? 's' : ''}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            </CardContent>
          </Card>

          {/* Node List */}
          <Card className="border border-gray-200">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="text-base font-medium">Node Status</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {nodes.map(node => (
                  <div
                    key={node.id}
                    className="p-3 rounded border border-gray-200 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{node.label}</span>
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: getStatusColor(node.status) }}
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                      <div>
                        <span className="text-gray-400">Type:</span>
                        <p className="text-gray-700">{node.type}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Devices:</span>
                        <p className="text-gray-700">{node.devices}</p>
                      </div>
                      {node.avgLatency > 0 && (
                        <div className="col-span-2">
                          <span className="text-gray-400">Avg Latency:</span>
                          <p className={getLatencyColor(node.avgLatency)}>
                            {Math.round(node.avgLatency)}ms
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Legend */}
        <Card className="border border-gray-200">
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-green-500" />
                <span className="text-sm text-gray-600">Healthy (&lt; 500ms)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-yellow-500" />
                <span className="text-sm text-gray-600">Warning (500-1000ms)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <span className="text-sm text-gray-600">Error (&gt; 1000ms)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-0.5 w-8 bg-orange-500" />
                <span className="text-sm text-gray-600">Route Recovered</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

