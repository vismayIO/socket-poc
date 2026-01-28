import fp from 'fastify-plugin';
import { RealtimeDataService } from '@/services/realtime-data';

export default fp(async (fastify) => {
    // Wait for NATS to be available
    await fastify.after();

    const realtimeService = new RealtimeDataService(fastify);

    // Decorate fastify instance with the service
    fastify.decorate('realtimeService', realtimeService);

    // Start the service when the server is ready
    fastify.addHook('onReady', async () => {
        realtimeService.start();
    });

    // Stop the service when the server closes
    fastify.addHook('onClose', async () => {
        realtimeService.stop();
    });
});