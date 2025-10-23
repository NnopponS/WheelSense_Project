/**
 * Simple Map Viewer with Zoom/Pan
 * ใช้ใน Dashboard สำหรับแสดงแผนที่
 */

import React, { useState, useRef } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface SimpleMapViewerProps {
  width?: number;
  height?: number;
  children: React.ReactNode;
  showControls?: boolean;
}

export function SimpleMapViewer({ 
  width = 800, 
  height = 600, 
  children,
  showControls = true 
}: SimpleMapViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev * 1.2, 5));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev / 1.2, 0.5));
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsPanning(true);
    setStartPos({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - startPos.x,
        y: e.clientY - startPos.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.min(Math.max(prev * delta, 0.5), 5));
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Zoom Controls */}
      {showControls && (
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 bg-white rounded-lg shadow-md p-2 border border-gray-200">
          <button
            onClick={handleZoomIn}
            className="h-8 w-8 flex items-center justify-center hover:bg-gray-100 rounded transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4 text-gray-700" />
          </button>
          <button
            onClick={handleZoomOut}
            className="h-8 w-8 flex items-center justify-center hover:bg-gray-100 rounded transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4 text-gray-700" />
          </button>
          <button
            onClick={handleReset}
            className="h-8 w-8 flex items-center justify-center hover:bg-gray-100 rounded transition-colors"
            title="Reset View"
          >
            <Maximize2 className="h-4 w-4 text-gray-700" />
          </button>
          <div className="border-t border-gray-200 my-1" />
          <div className="text-xs text-center text-gray-500">
            {Math.round(zoom * 100)}%
          </div>
        </div>
      )}

      {/* SVG Map */}
      <div 
        className="bg-white rounded border border-gray-100 overflow-hidden"
        style={{ 
          cursor: isPanning ? 'grabbing' : 'grab',
          width: '100%',
          height
        }}
      >
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {children}
          </g>
        </svg>
      </div>

      {/* Help Text */}
      {showControls && (
        <div className="mt-2 text-xs text-gray-500 text-center">
          🖱️ Click & Drag to pan • Scroll to zoom
        </div>
      )}
    </div>
  );
}

