/**
 * WheelSense JavaScript Bridge for Godot Web Export
 * Connects Godot game to WheelSense backend via WebSocket
 * Exposes window.WheelSense for GDScript to call via JavaScriptBridge.
 * 
 * Usage in Godot:
 *   var js = JavaScriptBridge.get_interface("WheelSense")
 *   js.send(JSON.stringify({"type": "character_event", "character": "emika", "event": "fall"}))
 */

(function() {
  'use strict';

  // Use relative URLs - works both in local dev and Docker
  const WS_BASE_URL = (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host + '/api/sim/game/ws';
  const TOKEN_URL = '/api/sim/game/token';
  
  let ws = null;
  let isConnected = false;
  let messageQueue = [];
  let onMessageCallback = null;
  let token = null;

  // Fetch token from backend (with fallback for local dev)
  async function fetchToken() {
    try {
      const response = await fetch(TOKEN_URL);
      if (!response.ok) {
        console.error('[WheelSenseBridge] Failed to fetch token:', response.status);
        // Fallback: try localhost:8000 for local development
        if (window.location.host !== 'localhost:8000') {
          console.log('[WheelSenseBridge] Retrying with localhost:8000...');
          const fallbackResponse = await fetch('http://localhost:8000/api/sim/game/token');
          if (fallbackResponse.ok) {
            const data = await fallbackResponse.json();
            return data.token || null;
          }
        }
        return null;
      }
      const data = await response.json();
      return data.token || null;
    } catch (err) {
      console.error('[WheelSenseBridge] Token fetch error:', err);
      // Fallback: try localhost:8000 for local development
      if (window.location.host !== 'localhost:8000') {
        try {
          console.log('[WheelSenseBridge] Retrying with localhost:8000...');
          const fallbackResponse = await fetch('http://localhost:8000/api/sim/game/token');
          if (fallbackResponse.ok) {
            const data = await fallbackResponse.json();
            return data.token || null;
          }
        } catch (fallbackErr) {
          console.error('[WheelSenseBridge] Fallback token fetch error:', fallbackErr);
        }
      }
      return null;
    }
  }

  // Connect WebSocket
  async function connect() {
    if (isConnected || ws) {
      console.log('[WheelSenseBridge] Already connected or connecting');
      return;
    }

    token = await fetchToken();
    if (!token) {
      console.error('[WheelSenseBridge] No token available, cannot connect');
      return;
    }

    const wsUrl = WS_BASE_URL + '?token=' + token;
    console.log('[WheelSenseBridge] Connecting to:', wsUrl);

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = function() {
        console.log('[WheelSenseBridge] WebSocket connected');
        isConnected = true;
        // Send any queued messages
        while (messageQueue.length > 0) {
          const msg = messageQueue.shift();
          ws.send(msg);
        }
        // Notify Godot
        if (typeof window.WheelSense !== 'undefined' && window.WheelSense._onConnected) {
          window.WheelSense._onConnected();
        }
      };

      ws.onmessage = function(event) {
        console.log('[WheelSenseBridge] Received:', event.data);
        if (onMessageCallback) {
          onMessageCallback(event.data);
        }
        // Also notify Godot via a global function if available
        if (typeof window.WheelSense !== 'undefined' && window.WheelSense._onMessage) {
          window.WheelSense._onMessage(event.data);
        }
      };

      ws.onclose = function() {
        console.log('[WheelSenseBridge] WebSocket closed');
        isConnected = false;
        ws = null;
        // Attempt reconnect after 3 seconds
        setTimeout(connect, 3000);
      };

      ws.onerror = function(error) {
        console.error('[WheelSenseBridge] WebSocket error:', error);
        isConnected = false;
      };
    } catch (err) {
      console.error('[WheelSenseBridge] Connection error:', err);
    }
  }

  // Send message to backend
  function send(message) {
    if (isConnected && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    } else {
      messageQueue.push(message);
      console.log('[WheelSenseBridge] Message queued (not connected)');
    }
  }

  // Set message callback
  function setOnMessage(callback) {
    onMessageCallback = callback;
  }

  // Initialize and connect
  console.log('[WheelSenseBridge] Initialized');
  connect();

  // Expose global interface
  window.WheelSense = {
    send: send,
    setOnMessage: setOnMessage,
    isConnected: function() { return isConnected; },
    _onConnected: null,
    _onMessage: null
  };
})();
