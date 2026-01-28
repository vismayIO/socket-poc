import { NatsConnection } from 'nats';
import { RealtimeDataService } from '@/services/realtime-data';

declare module 'fastify' {
    interface FastifyInstance {
        nc: NatsConnection;
        nats: typeof import('nats');
        realtimeService: RealtimeDataService;
    }
}