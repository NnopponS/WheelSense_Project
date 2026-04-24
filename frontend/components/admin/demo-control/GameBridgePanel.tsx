"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { 
  Gamepad2, 
  Monitor, 
  Circle, 
  Send, 
  RefreshCw,
  Users,
  MapPin,
  Activity,
  Move,
  Zap,
  Play
} from "lucide-react";
import { cn } from "@/lib/utils";

// Types from game bridge API
type GameActor = {
  character_name: string;
  character_role: string;
  patient_id?: number;
  caregiver_id?: number;
  sensor_mode: string;
  real_device_id?: number;
};

type GameRoom = {
  game_room_name: string;
  room_id: number;
};

type GameConfig = {
  workspace_id: number;
  actors: GameActor[];
  rooms: GameRoom[];
};

type GameState = {
  workspace_id: number;
  clients: {
    game: number;
    dashboard: number;
  };
  positions: Array<{
    actor_type: string;
    actor_id: number;
    room_id: number;
    source: string;
  }>;
};

type LogEntry = {
  id: string;
  message: string;
  type: "info" | "success" | "error" | "warn";
  timestamp: string;
};

export default function GameBridgePanel() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [clientType, setClientType] = useState<"game" | "dashboard">("dashboard");
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");
  const [moveDestination, setMoveDestination] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isQuickDriving, setIsQuickDriving] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = useCallback((message: string, type: LogEntry["type"] = "info") => {
    setLogs((prev) => [
      ...prev.slice(-49), // Keep last 50 logs
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        message,
        type,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      },
    ]);
  }, []);

  // Get token from cookie or fetch from API (cascade for cross-origin/game contexts)
  const getToken = useCallback(async (): Promise<string | null> => {
    // 1. Try cookie first (same-origin dashboard context)
    const match = document.cookie.match(/ws_token=([^;]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }

    // 2. Fallback to public token endpoint (game/simulator context)
    try {
      const response = await fetch("/api/sim/game/token");
      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          return data.token;
        }
      }
    } catch {
      // Silent fail - will return null below
    }

    return null;
  }, []);

  // Fetch game config
  const fetchGameConfig = useCallback(async () => {
    try {
      const response = await fetch("/api/sim/game/config");
      if (response.ok) {
        const config = await response.json();
        setGameConfig(config);
        addLog(`Loaded config: ${config.actors.length} actors, ${config.rooms.length} rooms`, "success");
      } else {
        addLog("Failed to load game config", "error");
      }
    } catch (error) {
      addLog(`Config fetch error: ${error}`, "error");
    }
  }, [addLog]);

  // Fetch game state
  const fetchGameState = useCallback(async () => {
    try {
      const response = await fetch("/api/sim/game/state");
      if (response.ok) {
        const state = await response.json();
        setGameState(state);
      }
    } catch (error) {
      console.error("Failed to fetch game state:", error);
    }
  }, []);

  // Connect WebSocket
  const connect = useCallback(async () => {
    setIsLoading(true);
    const token = await getToken();
    if (!token) {
      toast.error("Authentication required: Please login first to get a valid token");
      setIsLoading(false);
      return;
    }

    const wsUrl = `ws://localhost:8000/api/sim/game/ws?token=${encodeURIComponent(token)}&client_type=${clientType}`;
    
    addLog(`Connecting as ${clientType}...`, "info");
    
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      setIsConnected(true);
      setIsLoading(false);
      addLog(`Connected as ${clientType} client`, "success");
      fetchGameConfig();
      fetchGameState();
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        addLog(`← ${data.type}: ${JSON.stringify(data).slice(0, 100)}`, "info");
        
        if (data.type === "hello") {
          toast.success(`Connected to workspace ${data.workspace_id}`);
        }
        
        // Refresh state on relevant messages
        if (data.type === "character_enter_room" || data.type === "sensor_mode_updated") {
          fetchGameState();
        }
      } catch {
        addLog(`← ${event.data.slice(0, 100)}`, "info");
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
      setIsLoading(false);
      addLog("Disconnected", "warn");
    };

    socket.onerror = (error) => {
      setIsLoading(false);
      addLog("Connection error", "error");
      console.error("WebSocket error:", error);
    };

    setWs(socket);
  }, [clientType, getToken, toast, addLog, fetchGameConfig, fetchGameState]);

  // Disconnect
  const disconnect = useCallback(() => {
    ws?.close();
    setWs(null);
    setIsConnected(false);
  }, [ws]);

  // Send test message
  const sendTestMessage = useCallback(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      addLog("Not connected", "error");
      return;
    }

    const message = {
      type: "character_enter_room",
      character: selectedCharacter || "emika",
      room: selectedRoom || "Room401",
    };

    ws.send(JSON.stringify(message));
    addLog(`→ Sent: ${message.type}`, "success");
  }, [ws, selectedCharacter, selectedRoom, addLog]);

  // Send fall event via HTTP
  const sendFallEvent = useCallback(async () => {
    if (!selectedCharacter) {
      toast.error("Please select a character first");
      return;
    }
    try {
      const response = await fetch("/api/sim/game/event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "character_event",
          character: selectedCharacter,
          event: "fall",
        }),
      });

      if (response.ok) {
        addLog(`Fall event sent for ${selectedCharacter}`, "success");
        toast.success(`Fall event triggered for ${selectedCharacter}`);
        fetchGameState();
      } else {
        const error = await response.text();
        addLog(`Failed to send fall event: ${error}`, "error");
        toast.error("Failed to trigger fall event");
      }
    } catch (error) {
      addLog(`HTTP error: ${error}`, "error");
      toast.error("Network error sending fall event");
    }
  }, [selectedCharacter, addLog, fetchGameState]);

  // Send game event via HTTP fallback
  const sendGameEvent = useCallback(async () => {
    try {
      const response = await fetch("/api/sim/game/event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "character_enter_room",
          character: selectedCharacter || "emika",
          room: selectedRoom || "Room401",
        }),
      });

      if (response.ok) {
        addLog("Event sent via HTTP", "success");
        fetchGameState();
      } else {
        addLog("Failed to send event", "error");
      }
    } catch (error) {
      addLog(`HTTP error: ${error}`, "error");
    }
  }, [selectedCharacter, selectedRoom, addLog, fetchGameState]);

  // Send move actor command via WebSocket
  const sendMoveActor = useCallback(async () => {
    if (!selectedCharacter || !moveDestination) {
      toast.error("Please select a character and destination");
      return;
    }
    
    // Try WebSocket first
    if (ws && ws.readyState === WebSocket.OPEN) {
      const message = {
        type: "move_actor",
        character: selectedCharacter,
        destination: moveDestination,
        speed: "normal"
      };
      ws.send(JSON.stringify(message));
      addLog(`→ Move ${selectedCharacter} to ${moveDestination}`, "success");
      toast.success(`Moving ${selectedCharacter} to ${moveDestination}`);
    } else {
      // Fallback to HTTP
      try {
        const response = await fetch("/api/sim/game/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "move_actor",
            character: selectedCharacter,
            destination: moveDestination,
          }),
        });
        if (response.ok) {
          addLog(`Move command sent for ${selectedCharacter}`, "success");
          toast.success(`Move command sent`);
        } else {
          toast.error("Failed to send move command");
        }
      } catch (error) {
        toast.error("Network error");
      }
    }
  }, [ws, selectedCharacter, moveDestination, addLog, fetchGameState]);

  // Quick Drive: Connect and trigger auto-pilot simulation
  const quickDrive = useCallback(async () => {
    setIsQuickDriving(true);
    
    // 1. Connect if not connected
    if (!isConnected && !ws) {
      await connect();
      // Wait a moment for connection
      await new Promise(r => setTimeout(r, 1000));
    }
    
    // 2. Trigger simulation start via HTTP
    try {
      const response = await fetch("/api/sim/game/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "quick_drive",
          enabled: true,
          auto_move: true,
          random_events: true,
        }),
      });
      
      if (response.ok) {
        addLog("🚗 Quick Drive started - Auto-pilot simulation active", "success");
        toast.success("Quick Drive started! Characters now auto-moving.");
      } else {
        addLog("Quick Drive failed to start", "error");
        toast.error("Failed to start Quick Drive");
      }
    } catch (error) {
      addLog(`Quick Drive error: ${error}`, "error");
      toast.error("Network error starting Quick Drive");
    } finally {
      setIsQuickDriving(false);
    }
  }, [isConnected, ws, connect, addLog]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      ws?.close();
    };
  }, [ws]);

  // Auto-refresh state periodically when connected
  useEffect(() => {
    if (!isConnected) return;
    
    const interval = setInterval(fetchGameState, 5000);
    return () => clearInterval(interval);
  }, [isConnected, fetchGameState]);

  const getStatusColor = () => {
    if (isLoading) return "bg-yellow-500";
    if (isConnected) return "bg-emerald-500";
    return "bg-red-500";
  };

  const getStatusText = () => {
    if (isLoading) return "Connecting...";
    if (isConnected) return `Connected (${clientType})`;
    return "Disconnected";
  };

  return (
    <div className="space-y-4">
      {/* Connection Status Card */}
      <div className="rounded-2xl border border-border/70 bg-card/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cn("h-3 w-3 rounded-full animate-pulse", getStatusColor())} />
            <div>
              <p className="font-medium text-foreground">{getStatusText()}</p>
              <p className="text-xs text-muted-foreground">
                {gameState ? `${gameState.clients.game} game, ${gameState.clients.dashboard} dashboard clients` : "No connection"}
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <Select value={clientType} onValueChange={(v) => setClientType(v as "game" | "dashboard")} disabled={isConnected}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dashboard">
                  <span className="flex items-center gap-2">
                    <Monitor className="h-4 w-4" />
                    Dashboard
                  </span>
                </SelectItem>
                <SelectItem value="game">
                  <span className="flex items-center gap-2">
                    <Gamepad2 className="h-4 w-4" />
                    Game
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            
            {isConnected ? (
              <Button variant="outline" onClick={disconnect}>
                Disconnect
              </Button>
            ) : (
              <Button onClick={connect} disabled={isLoading}>
                {isLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                Connect
              </Button>
            )}
            <Button 
              variant="secondary" 
              onClick={() => window.open('http://localhost:8080', '_blank')}
              title="Open Godot Game in new tab"
            >
              <Gamepad2 className="mr-2 h-4 w-4" />
              Launch Game
            </Button>
          </div>
        </div>
      </div>

      {/* Game Configuration */}
      {gameConfig && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border/70 bg-card/90 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-primary" />
              <h4 className="font-medium">Characters ({gameConfig.actors.length})</h4>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {gameConfig.actors.map((actor) => (
                <Badge 
                  key={actor.character_name} 
                  variant={actor.character_role === "patient" ? "default" : "secondary"}
                  className="cursor-pointer hover:bg-primary/80"
                  onClick={() => setSelectedCharacter(actor.character_name)}
                >
                  {actor.character_name}
                  {actor.sensor_mode === "real_device" && <Circle className="ml-1 h-2 w-2 fill-current" />}
                </Badge>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/90 p-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4 text-primary" />
              <h4 className="font-medium">Rooms ({gameConfig.rooms.length})</h4>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {gameConfig.rooms.map((room) => (
                <Badge 
                  key={room.game_room_name} 
                  variant="outline"
                  className="cursor-pointer hover:bg-secondary"
                  onClick={() => setSelectedRoom(room.game_room_name)}
                >
                  {room.game_room_name}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Actor Positions */}
      {gameState && gameState.positions.length > 0 && (
        <div className="rounded-2xl border border-border/70 bg-card/90 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-primary" />
            <h4 className="font-medium">Actor Positions ({gameState.positions.length})</h4>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {gameState.positions.map((pos) => (
              <div 
                key={`${pos.actor_type}-${pos.actor_id}`}
                className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm"
              >
                <span className="capitalize">{pos.actor_type} #{pos.actor_id}</span>
                <Badge variant="outline" className="text-xs">
                  Room {pos.room_id}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Move Actor Controls */}
      <div className="rounded-2xl border border-border/70 bg-card/90 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Move className="h-4 w-4 text-primary" />
          <h4 className="font-medium">Move Actor</h4>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Character</Label>
            <Select value={selectedCharacter} onValueChange={setSelectedCharacter}>
              <SelectTrigger>
                <SelectValue placeholder="Select character" />
              </SelectTrigger>
              <SelectContent>
                {gameConfig?.actors.map((actor) => (
                  <SelectItem key={actor.character_name} value={actor.character_name}>
                    {actor.character_name} ({actor.character_role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-1.5">
            <Label className="text-xs">Destination</Label>
            <Select value={moveDestination} onValueChange={setMoveDestination}>
              <SelectTrigger>
                <SelectValue placeholder="Select room" />
              </SelectTrigger>
              <SelectContent>
                {gameConfig?.rooms.map((room) => (
                  <SelectItem key={room.game_room_name} value={room.game_room_name}>
                    {room.game_room_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button 
              onClick={sendMoveActor}
              disabled={!selectedCharacter || !moveDestination}
              className="w-full"
            >
              <Move className="mr-2 h-4 w-4" />
              Move Actor
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Drive */}
      <div className="rounded-2xl border border-border/70 bg-gradient-to-r from-primary/10 to-secondary/10 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <div>
              <h4 className="font-medium">Game Quick Drive</h4>
              <p className="text-xs text-muted-foreground">
                Auto-connect and start simulation with random character movements
              </p>
            </div>
          </div>
          <Button 
            variant="default"
            onClick={quickDrive}
            disabled={isQuickDriving}
            className="min-w-[140px]"
          >
            {isQuickDriving ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {isQuickDriving ? "Starting..." : "Quick Drive"}
          </Button>
        </div>
      </div>

      {/* Test Controls */}
      <div className="rounded-2xl border border-border/70 bg-card/90 p-4">
        <h4 className="font-medium mb-3">Send Test Event</h4>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Character</Label>
            <Select value={selectedCharacter} onValueChange={setSelectedCharacter}>
              <SelectTrigger>
                <SelectValue placeholder="Select character" />
              </SelectTrigger>
              <SelectContent>
                {gameConfig?.actors.map((actor) => (
                  <SelectItem key={actor.character_name} value={actor.character_name}>
                    {actor.character_name} ({actor.character_role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-1.5">
            <Label className="text-xs">Room</Label>
            <Select value={selectedRoom} onValueChange={setSelectedRoom}>
              <SelectTrigger>
                <SelectValue placeholder="Select room" />
              </SelectTrigger>
              <SelectContent>
                {gameConfig?.rooms.map((room) => (
                  <SelectItem key={room.game_room_name} value={room.game_room_name}>
                    {room.game_room_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-2">
            <Button 
              onClick={sendTestMessage} 
              disabled={!isConnected || !selectedCharacter || !selectedRoom}
              className="flex-1"
            >
              <Send className="mr-2 h-4 w-4" />
              WS Send
            </Button>
            <Button 
              variant="outline"
              onClick={sendGameEvent}
              disabled={!selectedCharacter || !selectedRoom}
              className="flex-1"
            >
              HTTP
            </Button>
          </div>
          
          <div className="flex items-end">
            <Button 
              variant="destructive"
              onClick={sendFallEvent}
              disabled={!selectedCharacter}
              className="w-full"
            >
              Send Fall Event
            </Button>
          </div>
        </div>
      </div>

      {/* Log Console */}
      <div className="rounded-2xl border border-border/70 bg-card/90 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium">Event Log</h4>
          <Badge variant="outline" className="text-xs">
            {logs.length} entries
          </Badge>
        </div>
        <div className="h-40 overflow-y-auto rounded-lg bg-muted/30 p-3 font-mono text-xs space-y-1">
          {logs.length === 0 ? (
            <p className="text-muted-foreground italic">No events yet...</p>
          ) : (
            logs.map((log) => (
              <div 
                key={log.id}
                className={cn(
                  "flex gap-2",
                  log.type === "error" && "text-red-500",
                  log.type === "success" && "text-emerald-500",
                  log.type === "warn" && "text-yellow-500"
                )}
              >
                <span className="text-muted-foreground shrink-0">{log.timestamp}</span>
                <span className="break-all">{log.message}</span>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
}
