import type { FastifyPluginAsync } from "fastify";
import { auth } from "@/utils/auth";

const realtimeRoute: FastifyPluginAsync = async (fastify): Promise<void> => {
    // Middleware to verify auth token
    const verifyAuth = async (request: any, reply: any) => {
        try {
            const authHeader = request.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return reply.status(401).send({ error: 'Missing or invalid authorization header' });
            }

            const token = authHeader.substring(7);
            const session = await auth.api.getSession({
                headers: { authorization: `Bearer ${token}` }
            });

            if (!session) {
                return reply.status(401).send({ error: 'Invalid session' });
            }

            request.user = session.user;
            request.session = session.session;
        } catch (error) {
            fastify.log.error('Auth verification failed:', error);
            return reply.status(401).send({ error: 'Authentication failed' });
        }
    };

    // Get auth token for NATS WebSocket connection
    fastify.get('/auth-token', { preHandler: verifyAuth }, async (request, reply) => {
        const user = (request as any).user;
        const session = (request as any).session;

        // Create a temporary token for NATS connection
        const natsToken = Buffer.from(JSON.stringify({
            userId: user.id,
            sessionId: session.id,
            timestamp: Date.now()
        })).toString('base64');

        reply.send({
            token: natsToken,
            userId: user.id,
            wsUrl: 'ws://localhost:8080'
        });
    });

    // Publish real-time data (for testing)
    fastify.post('/publish', { preHandler: verifyAuth }, async (request, reply) => {
        const { subject, data } = request.body as { subject: string; data: any };
        const user = (request as any).user;

        try {
            // Add user context to the data
            const enrichedData = {
                ...data,
                userId: user.id,
                timestamp: new Date().toISOString()
            };

            fastify.nc.publish(subject, JSON.stringify(enrichedData));

            reply.send({
                success: true,
                message: `Published to ${subject}`,
                data: enrichedData
            });
        } catch (error) {
            fastify.log.error('Failed to publish:', error);
            reply.status(500).send({ error: 'Failed to publish data' });
        }
    });
};

export default realtimeRoute;