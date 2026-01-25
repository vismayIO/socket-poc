import {
  NatsStreamingService,
  MarketDataMessage,
} from "./nats-streaming.service";
import { WebSocketService } from "./websocket.service";

export class MessageRouterService {
  private natsService: NatsStreamingService;
  private webSocketService: WebSocketService;
  private isRouting = false;

  constructor(
    natsService: NatsStreamingService,
    webSocketService: WebSocketService,
  ) {
    this.natsService = natsService;
    this.webSocketService = webSocketService;
  }

  /**
   * Start routing messages from NATS to WebSocket clients
   */
  async startRouting(): Promise<void> {
    if (this.isRouting) {
      console.log("Message routing already started");
      return;
    }

    try {
      console.log("Starting message routing from NATS to WebSocket clients...");

      // Subscribe to all market data and route to WebSocket clients
      await this.natsService.subscribeToMarketData(
        (message: MarketDataMessage) => {
          this.routeMessageToWebSocket(message);
        },
      );

      this.isRouting = true;
      console.log("Message routing started successfully");
    } catch (error) {
      console.error("Failed to start message routing:", error);
      throw error;
    }
  }

  /**
   * Stop message routing
   */
  stopRouting(): void {
    this.isRouting = false;
    console.log("Message routing stopped");
  }

  /**
   * Route NATS message to appropriate WebSocket channels
   */
  private routeMessageToWebSocket(message: MarketDataMessage): void {
    try {
      // Route based on message type
      switch (message.type) {
        case "trade":
          this.routeTradeMessage(message);
          break;
        case "quote":
          this.routeQuoteMessage(message);
          break;
        case "orderbook":
          this.routeOrderBookMessage(message);
          break;
        case "ohlcv":
          this.routeOHLCVMessage(message);
          break;
        default:
          console.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error("Error routing message to WebSocket:", error);
    }
  }

  /**
   * Route trade messages to WebSocket clients
   */
  private routeTradeMessage(message: MarketDataMessage): void {
    const channel = `trades:${message.symbol}`;

    const webSocketMessage = {
      type: "trade",
      symbol: message.symbol,
      data: message.data,
      timestamp: message.timestamp,
    };

    this.webSocketService.broadcast(channel, webSocketMessage);
  }

  /**
   * Route quote messages to WebSocket clients
   */
  private routeQuoteMessage(message: MarketDataMessage): void {
    const channel = `quotes:${message.symbol}`;

    const webSocketMessage = {
      type: "quote",
      symbol: message.symbol,
      data: message.data,
      timestamp: message.timestamp,
    };

    this.webSocketService.broadcast(channel, webSocketMessage);
  }

  /**
   * Route order book messages to WebSocket clients
   */
  private routeOrderBookMessage(message: MarketDataMessage): void {
    const channel = `orderbook:${message.symbol}`;

    const webSocketMessage = {
      type: "orderbook",
      symbol: message.symbol,
      data: message.data,
      timestamp: message.timestamp,
    };

    this.webSocketService.broadcast(channel, webSocketMessage);
  }

  /**
   * Route OHLCV messages to WebSocket clients
   */
  private routeOHLCVMessage(message: MarketDataMessage): void {
    const interval = message.data.interval || "1m";
    const channel = `ohlcv:${message.symbol}:${interval}`;

    const webSocketMessage = {
      type: "ohlcv",
      symbol: message.symbol,
      interval,
      data: message.data,
      timestamp: message.timestamp,
    };

    this.webSocketService.broadcast(channel, webSocketMessage);
  }

  /**
   * Get routing status
   */
  getStatus(): {
    isRouting: boolean;
    natsStatus: any;
    webSocketStats: any;
  } {
    return {
      isRouting: this.isRouting,
      natsStatus: this.natsService.getConnectionStatus(),
      webSocketStats: this.webSocketService.getConnectionStats(),
    };
  }
}
