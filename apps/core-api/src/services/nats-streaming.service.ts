import {
  connect,
  NatsConnection,
  JetStreamManager,
  JetStreamClient,
  StringCodec,
  JSONCodec,
  RetentionPolicy,
  StorageType,
  DiscardPolicy,
  consumerOpts,
} from "nats";

export interface StreamingConfig {
  servers: string[];
  maxReconnectAttempts: number;
  reconnectTimeWait: number;
  connectionPoolSize: number;
}

export interface MarketDataMessage {
  type: "trade" | "quote" | "orderbook" | "ohlcv";
  symbol: string;
  data: any;
  timestamp: Date;
  sequence?: number;
}

export class NatsStreamingService {
  private connections: NatsConnection[] = [];
  private jetStreamManager?: JetStreamManager;
  private jetStreamClient?: JetStreamClient;
  private config: StreamingConfig;
  private _isConnected = false;
  private reconnectAttempts = 0;
  private stringCodec = StringCodec();
  private jsonCodec = JSONCodec();
  private useJetStream = true; // Flag to track if JetStream is available

  // Stream and subject configurations
  private readonly STREAMS = {
    MARKET_DATA: "MARKET_DATA",
    TRADES: "TRADES",
    QUOTES: "QUOTES",
    ORDER_BOOK: "ORDER_BOOK",
    OHLCV: "OHLCV",
  };

  private readonly SUBJECTS = {
    TRADES: "market.trades",
    QUOTES: "market.quotes",
    ORDER_BOOK: "market.orderbook",
    OHLCV: "market.ohlcv",
  };

  constructor(config?: Partial<StreamingConfig>) {
    this.config = {
      servers: config?.servers || [
        process.env.NATS_URL || "nats://localhost:4222",
      ],
      maxReconnectAttempts: config?.maxReconnectAttempts || 10,
      reconnectTimeWait: config?.reconnectTimeWait || 2000,
      connectionPoolSize: config?.connectionPoolSize || 3,
    };
  }

  /**
   * Initialize NATS connection and JetStream
   */
  async initialize(): Promise<void> {
    try {
      console.log("Initializing NATS streaming service...");

      // Create connection pool
      for (let i = 0; i < this.config.connectionPoolSize; i++) {
        const connection = await this.createConnection();
        this.connections.push(connection);
      }

      // Try to initialize JetStream (may fail due to permissions)
      try {
        const primaryConnection = this.connections[0];
        this.jetStreamManager = await primaryConnection.jetstreamManager();
        this.jetStreamClient = primaryConnection.jetstream();

        // Setup streams
        await this.setupStreams();
        console.log("JetStream initialized successfully");
      } catch (jsError: any) {
        // Handle JetStream permission errors gracefully
        if (jsError?.code === "503" || jsError?.message?.includes("503") || jsError?.message?.includes("No Responders")) {
          console.warn("⚠️ JetStream not available (likely permission issue), using simple pub/sub");
          this.useJetStream = false;
          this.jetStreamManager = undefined;
          this.jetStreamClient = undefined;
        } else {
          throw jsError;
        }
      }

      this._isConnected = true;
      this.reconnectAttempts = 0;

      console.log(
        `NATS streaming service initialized with ${this.connections.length} connections (JetStream: ${this.useJetStream ? 'enabled' : 'disabled'})`,
      );
    } catch (error) {
      console.error("Failed to initialize NATS streaming service:", error);
      await this.handleConnectionError(error);
      throw error;
    }
  }

  /**
   * Create a single NATS connection with error handling
   */
  private async createConnection(): Promise<NatsConnection> {
    const connection = await connect({
      servers: this.config.servers,
      maxReconnectAttempts: this.config.maxReconnectAttempts,
      reconnectTimeWait: this.config.reconnectTimeWait,
      name: `market-data-api-${Date.now()}`,
      // Use APP account credentials for internal API service
      // This user has permissions for JetStream operations
      user: process.env.NATS_API_USER || "api_service",
      pass: process.env.NATS_API_PASS || "api_service_secret",
    });

    // Setup connection event handlers
    connection.closed().then((err) => {
      if (err) {
        console.error("NATS connection closed with error:", err);
        this.handleConnectionError(err);
      } else {
        console.log("NATS connection closed gracefully");
      }
    });

    return connection;
  }

  /**
   * Setup JetStream streams for different data types
   */
  private async setupStreams(): Promise<void> {
    if (!this.jetStreamManager) {
      throw new Error("JetStream manager not initialized");
    }

    try {
      // Create main market data stream
      await this.jetStreamManager.streams.add({
        name: this.STREAMS.MARKET_DATA,
        subjects: [
          `${this.SUBJECTS.TRADES}.*`,
          `${this.SUBJECTS.QUOTES}.*`,
          `${this.SUBJECTS.ORDER_BOOK}.*`,
          `${this.SUBJECTS.OHLCV}.*`,
        ],
        retention: RetentionPolicy.Limits,
        max_age: 24 * 60 * 60 * 1000 * 1000000, // 24 hours in nanoseconds
        max_msgs: 1000000, // 1M messages max
        max_bytes: 1024 * 1024 * 1024, // 1GB max
        storage: StorageType.Memory, // Use memory storage for high performance
        num_replicas: 1,
        discard: DiscardPolicy.Old,
      });

      console.log("JetStream streams configured successfully");
    } catch (error) {
      // Stream might already exist, check if it's a "stream already exists" error
      if (error instanceof Error && error.message.includes("already exists")) {
        console.log("JetStream streams already exist, continuing...");
      } else {
        console.error("Failed to setup JetStream streams:", error);
        throw error;
      }
    }
  }

  /**
   * Publish market data message to appropriate stream
   */
  async publishMarketData(message: MarketDataMessage): Promise<void> {
    if (!this._isConnected || this.connections.length === 0) {
      throw new Error("NATS streaming service not connected");
    }

    try {
      const subject = this.getSubjectForMessage(message);
      const data = this.jsonCodec.encode(message);

      // Use round-robin connection selection for load balancing
      const connectionIndex = Math.floor(
        Math.random() * this.connections.length,
      );
      const connection = this.connections[connectionIndex];

      if (this.useJetStream && this.jetStreamClient) {
        // Use JetStream if available
        const js = connection.jetstream();
        await js.publish(subject, data, {
          msgID: `${message.symbol}-${message.type}-${Date.now()}`,
        });
      } else {
        // Fall back to simple pub/sub
        connection.publish(subject, data);
      }
    } catch (error) {
      console.error("Failed to publish market data:", error);
      throw error;
    }
  }

  /**
   * Publish trade data
   */
  async publishTrade(symbol: string, tradeData: any): Promise<void> {
    const message: MarketDataMessage = {
      type: "trade",
      symbol,
      data: tradeData,
      timestamp: new Date(),
    };

    await this.publishMarketData(message);
  }

  /**
   * Publish quote data
   */
  async publishQuote(symbol: string, quoteData: any): Promise<void> {
    const message: MarketDataMessage = {
      type: "quote",
      symbol,
      data: quoteData,
      timestamp: new Date(),
    };

    await this.publishMarketData(message);
  }

  /**
   * Publish order book data
   */
  async publishOrderBook(symbol: string, orderBookData: any): Promise<void> {
    const message: MarketDataMessage = {
      type: "orderbook",
      symbol,
      data: orderBookData,
      timestamp: new Date(),
    };

    await this.publishMarketData(message);
  }

  /**
   * Publish OHLCV data
   */
  async publishOHLCV(
    symbol: string,
    ohlcvData: any,
    interval: string,
  ): Promise<void> {
    const message: MarketDataMessage = {
      type: "ohlcv",
      symbol,
      data: { ...ohlcvData, interval },
      timestamp: new Date(),
    };

    await this.publishMarketData(message);
  }

  /**
   * Subscribe to market data stream and route to WebSocket clients
   */
  async subscribeToMarketData(
    callback: (message: MarketDataMessage) => void,
    filterSymbols?: string[],
  ): Promise<void> {
    if (!this._isConnected || this.connections.length === 0) {
      throw new Error("NATS streaming service not connected");
    }

    try {
      // Subscribe to all market data subjects
      const subjects = [
        `${this.SUBJECTS.TRADES}.*`,
        `${this.SUBJECTS.QUOTES}.*`,
        `${this.SUBJECTS.ORDER_BOOK}.*`,
        `${this.SUBJECTS.OHLCV}.*`,
      ];

      const primaryConnection = this.connections[0];

      if (this.useJetStream && this.jetStreamClient) {
        // Use JetStream subscriptions if available
        for (const subject of subjects) {
          const opts = consumerOpts();
          opts.durable(`market-data-consumer-${Date.now()}`);
          opts.deliverNew();
          opts.ackExplicit();
          const subscription = await this.jetStreamClient.subscribe(subject, opts);
          this.processSubscription(subscription, callback, filterSymbols);
        }
      } else {
        // Fall back to simple subscriptions
        for (const subject of subjects) {
          const sub = primaryConnection.subscribe(subject);
          this.processSimpleSubscription(sub, callback, filterSymbols);
        }
      }

      console.log(`Subscribed to market data streams (JetStream: ${this.useJetStream})`);
    } catch (error) {
      console.error("Failed to subscribe to market data:", error);
      throw error;
    }
  }

  /**
   * Process subscription messages
   */
  private async processSubscription(
    subscription: any,
    callback: (message: MarketDataMessage) => void,
    filterSymbols?: string[],
  ): Promise<void> {
    try {
      for await (const msg of subscription) {
        try {
          const marketDataMessage = this.jsonCodec.decode(
            msg.data,
          ) as MarketDataMessage;

          // Apply symbol filter if provided
          if (
            filterSymbols &&
            !filterSymbols.includes(marketDataMessage.symbol)
          ) {
            msg.ack();
            continue;
          }

          // Call the callback with the message
          callback(marketDataMessage);

          // Acknowledge the message
          msg.ack();
        } catch (error) {
          console.error("Error processing market data message:", error);
          msg.nak();
        }
      }
    } catch (error) {
      console.error("Error in subscription processing:", error);
    }
  }

  /**
   * Get appropriate subject for message type
   */
  private getSubjectForMessage(message: MarketDataMessage): string {
    switch (message.type) {
      case "trade":
        return `${this.SUBJECTS.TRADES}.${message.symbol}`;
      case "quote":
        return `${this.SUBJECTS.QUOTES}.${message.symbol}`;
      case "orderbook":
        return `${this.SUBJECTS.ORDER_BOOK}.${message.symbol}`;
      case "ohlcv":
        return `${this.SUBJECTS.OHLCV}.${message.symbol}`;
      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle connection errors and implement reconnection logic
   */
  private async handleConnectionError(error: any): Promise<void> {
    this._isConnected = false;
    this.reconnectAttempts++;

    console.error(
      `NATS connection error (attempt ${this.reconnectAttempts}):`,
      error,
    );

    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      console.log(
        `Attempting to reconnect in ${this.config.reconnectTimeWait}ms...`,
      );

      setTimeout(async () => {
        try {
          await this.initialize();
        } catch (reconnectError) {
          console.error("Reconnection failed:", reconnectError);
        }
      }, this.config.reconnectTimeWait);
    } else {
      console.error(
        "Max reconnection attempts reached. Manual intervention required.",
      );
    }
  }

  /**
   * Check if NATS is connected
   */
  checkConnected(): boolean {
    return this._isConnected && this.connections.length > 0;
  }

  /**
   * Get connection status and statistics
   */
  getConnectionStatus(): {
    isConnected: boolean;
    connectionCount: number;
    reconnectAttempts: number;
    streams: string[];
    useJetStream: boolean;
  } {
    return {
      isConnected: this._isConnected,
      connectionCount: this.connections.length,
      reconnectAttempts: this.reconnectAttempts,
      streams: Object.values(this.STREAMS),
      useJetStream: this.useJetStream,
    };
  }

  /**
   * Gracefully close all connections
   */
  async close(): Promise<void> {
    console.log("Closing NATS streaming service...");

    for (const connection of this.connections) {
      try {
        await connection.close();
      } catch (error) {
        console.error("Error closing NATS connection:", error);
      }
    }

    this.connections = [];
    this._isConnected = false;
    this.jetStreamManager = undefined;
    this.jetStreamClient = undefined;
    this.useJetStream = true; // Reset for next initialization

    console.log("NATS streaming service closed");
  }

  /**
   * Process simple (non-JetStream) subscription messages
   */
  private async processSimpleSubscription(
    subscription: any,
    callback: (message: MarketDataMessage) => void,
    filterSymbols?: string[],
  ): Promise<void> {
    try {
      for await (const msg of subscription) {
        try {
          const marketDataMessage = this.jsonCodec.decode(
            msg.data,
          ) as MarketDataMessage;

          // Apply symbol filter if provided
          if (
            filterSymbols &&
            !filterSymbols.includes(marketDataMessage.symbol)
          ) {
            continue;
          }

          // Call the callback with the message
          callback(marketDataMessage);
        } catch (error) {
          console.error("Error processing market data message:", error);
        }
      }
    } catch (error) {
      console.error("Error in subscription processing:", error);
    }
  }
}
