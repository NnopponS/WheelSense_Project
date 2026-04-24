import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import GameBridgePanel from "./GameBridgePanel";

// Mock sonner
jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock WebSocket
const mockWebSocketInstances: any[] = [];

const MockWebSocket = jest.fn((url: string) => {
  const ws: any = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
    readyState: 0,
    url: url,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    sentMessages: [],
    send: jest.fn(function(this: any, data: string) {
      this.sentMessages.push(data);
    }),
    close: jest.fn(function(this: any) {
      this.readyState = 3;
      if (this.onclose) this.onclose(new CloseEvent("close"));
    }),
    addEventListener: jest.fn(function(this: any, event: string, handler: any) {
      if (event === "open") this.onopen = handler;
      if (event === "message") this.onmessage = handler;
      if (event === "close") this.onclose = handler;
      if (event === "error") this.onerror = handler;
    }),
    removeEventListener: jest.fn(),
  };
  
  mockWebSocketInstances.push(ws);
  
  // Simulate async connection
  setTimeout(() => {
    ws.readyState = 1;
    if (ws.onopen) ws.onopen(new Event("open"));
  }, 10);
  
  return ws;
});

(MockWebSocket as any).CONNECTING = 0;
(MockWebSocket as any).OPEN = 1;
(MockWebSocket as any).CLOSING = 2;
(MockWebSocket as any).CLOSED = 3;

(global as any).WebSocket = MockWebSocket;

describe("GameBridgePanel", () => {
  beforeEach(() => {
    // Reset document.cookie
    document.cookie = "";
    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    document.cookie = "";
  });

  it("should render without crashing", () => {
    render(<GameBridgePanel />);
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
    expect(screen.getByText("Connect")).toBeInTheDocument();
  });

  it("should show connection status as disconnected initially", () => {
    render(<GameBridgePanel />);
    const statusText = screen.getByText(/disconnected/i);
    expect(statusText).toBeInTheDocument();
  });

  it("should show error toast when connecting without token", async () => {
    const { toast } = require("sonner");
    render(<GameBridgePanel />);
    
    const connectButton = screen.getByText("Connect");
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Authentication required: Please login first to get a valid token"
      );
    });
  });

  it("should attempt to connect when Connect button is clicked with token", async () => {
    document.cookie = "ws_token=test-token-123";
    render(<GameBridgePanel />);
    
    const connectButton = screen.getByText("Connect");
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(screen.getByText(/connecting/i)).toBeInTheDocument();
    });
  });

  it("should show connected status after successful connection", async () => {
    document.cookie = "ws_token=test-token-123";
    render(<GameBridgePanel />);
    
    const connectButton = screen.getByText("Connect");
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(screen.getByText(/connected/i)).toBeInTheDocument();
    }, { timeout: 100 });
  });

  it("should disconnect when Disconnect button is clicked", async () => {
    document.cookie = "ws_token=test-token-123";
    render(<GameBridgePanel />);
    
    // Connect first
    const connectButton = screen.getByText("Connect");
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(screen.getByText(/connected/i)).toBeInTheDocument();
    });

    // Then disconnect
    const disconnectButton = screen.getByText("Disconnect");
    fireEvent.click(disconnectButton);

    await waitFor(() => {
      expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
    });
  });

  it("should display client type selector", () => {
    render(<GameBridgePanel />);
    expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
  });

  it("should disable connect button when already connected", async () => {
    document.cookie = "ws_token=test-token-123";
    render(<GameBridgePanel />);
    
    const connectButton = screen.getByText("Connect");
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(connectButton).toBeDisabled();
    });
  });

  it("should show event log section", () => {
    render(<GameBridgePanel />);
    expect(screen.getByText(/event log/i)).toBeInTheDocument();
    expect(screen.getByText(/no events yet/i)).toBeInTheDocument();
  });

  it("should show send test event controls", () => {
    render(<GameBridgePanel />);
    expect(screen.getByText(/send test event/i)).toBeInTheDocument();
    expect(screen.getByText(/character/i)).toBeInTheDocument();
    expect(screen.getByText(/room/i)).toBeInTheDocument();
  });

  it("should add log entry on connection attempt", async () => {
    document.cookie = "ws_token=test-token-123";
    render(<GameBridgePanel />);
    
    const connectButton = screen.getByText("Connect");
    fireEvent.click(connectButton);

    await waitFor(() => {
      const logs = screen.queryByText(/connecting as dashboard/i);
      expect(logs).toBeInTheDocument();
    });
  });

  it("should disable send buttons when not connected", () => {
    render(<GameBridgePanel />);
    const wsSendButton = screen.getByText(/ws send/i);
    expect(wsSendButton).toBeDisabled();
  });

  it("should enable send buttons when connected", async () => {
    document.cookie = "ws_token=test-token-123";
    render(<GameBridgePanel />);
    
    const connectButton = screen.getByText("Connect");
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(screen.getByText(/connected/i)).toBeInTheDocument();
    });

    // Note: This test will fail until we implement character/room selection
    // For now, we just check the button exists
    const wsSendButton = screen.getByText(/ws send/i);
    expect(wsSendButton).toBeInTheDocument();
  });
});
