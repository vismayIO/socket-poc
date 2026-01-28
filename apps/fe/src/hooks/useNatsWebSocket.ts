import { useEffect, useRef, useState, useCallback } from 'react';
import { connect as natsConnect, type NatsConnection, type Subscription } from 'nats.ws';
import { authClient } from '@/lib/auth-client';
import { toast } from 'sonner';

interface NatsConfig {
    subjects: string[];
    onMessage?: (subject: string, data: any) => void;
    onError?: (error: Error) => void;
    autoReconnect?: boolean;
}

interface NatsState {
    connected: boolean;
    connecting: boolean;
    error: string | null;
    lastMessage: { subject: string; data: any; timestamp: number } | null;
}

export function useNatsWebSocket(config: NatsConfig) {
    const [state, setState] = useState<NatsState>({
        connected: false,
        connecting: false,
        error: null,
        lastMessage: null
    });

    const connectionRef = useRef<NatsConnection | null>(null);
    const subscriptionsRef = useRef<Subscription[]>([]);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const { data: session } = authClient.useSession();

    const cleanup = useCallback(() => {
        // Clear reconnect timeout
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        // Unsubscribe from all subjects
        subscriptionsRef.current.forEach(sub => {
            try {
                sub.unsubscribe();
            } catch (error) {
                console.warn('Error unsubscribing:', error);
            }
        });
        subscriptionsRef.current = [];

        // Close connection
        if (connectionRef.current) {
            try {
                connectionRef.current.close();
            } catch (error) {
                console.warn('Error closing connection:', error);
            }
            connectionRef.current = null;
        }
    }, []);

    const connectToNats = useCallback(async () => {
        if (!session?.user || state.connecting || state.connected) {
            return;
        }

        setState(prev => ({ ...prev, connecting: true, error: null }));

        try {
            // Get auth token for NATS connection
            const response = await fetch('http://localhost:3001/api/realtime/auth-token', {
                headers: {
                    'Authorization': `Bearer ${session.session.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to get NATS auth token');
            }

            const { token, wsUrl } = await response.json();

            // Connect to NATS WebSocket
            const nc = await natsConnect({
                servers: [wsUrl],
                token: token,
                reconnect: config.autoReconnect !== false,
                maxReconnectAttempts: 5,
                reconnectTimeWait: 2000
            });

            connectionRef.current = nc;

            // Subscribe to subjects
            const subscriptions = await Promise.all(
                config.subjects.map(async (subject) => {
                    const sub = nc.subscribe(subject);

                    // Handle messages
                    (async () => {
                        for await (const msg of sub) {
                            try {
                                const data = JSON.parse(new TextDecoder().decode(msg.data));

                                setState(prev => ({
                                    ...prev,
                                    lastMessage: { subject, data, timestamp: Date.now() }
                                }));

                                config.onMessage?.(subject, data);
                            } catch (error) {
                                console.error('Error parsing message:', error);
                                config.onError?.(error as Error);
                            }
                        }
                    })();

                    return sub;
                })
            );

            subscriptionsRef.current = subscriptions;

            setState(prev => ({
                ...prev,
                connected: true,
                connecting: false,
                error: null
            }));

            toast.success('Connected to real-time updates');

            // Handle connection events
            nc.closed().then(() => {
                setState(prev => ({
                    ...prev,
                    connected: false,
                    connecting: false
                }));

                if (config.autoReconnect !== false) {
                    reconnectTimeoutRef.current = setTimeout(() => {
                        connectToNats();
                    }, 3000);
                }
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Connection failed';

            setState(prev => ({
                ...prev,
                connected: false,
                connecting: false,
                error: errorMessage
            }));

            config.onError?.(error as Error);
            toast.error(`Real-time connection failed: ${errorMessage}`);

            // Retry connection if auto-reconnect is enabled
            if (config.autoReconnect !== false) {
                reconnectTimeoutRef.current = setTimeout(() => {
                    connectToNats();
                }, 5000);
            }
        }
    }, [session, state.connecting, state.connected, config]);

    const disconnect = useCallback(() => {
        cleanup();
        setState(prev => ({
            ...prev,
            connected: false,
            connecting: false,
            error: null
        }));
    }, [cleanup]);

    const publish = useCallback(async (subject: string, data: any) => {
        if (!session?.user) {
            throw new Error('Not authenticated');
        }

        const response = await fetch('http://localhost:3001/api/realtime/publish', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.session.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ subject, data })
        });

        if (!response.ok) {
            throw new Error('Failed to publish message');
        }

        return response.json();
    }, [session]);

    // Auto-connect when session is available
    useEffect(() => {
        if (session?.user && !state.connected && !state.connecting) {
            connectToNats();
        }
    }, [session, state.connected, state.connecting, connectToNats]);

    // Cleanup on unmount
    useEffect(() => {
        return cleanup;
    }, [cleanup]);

    return {
        ...state,
        connect: connectToNats,
        disconnect,
        publish
    };
}