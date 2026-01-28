import fp from 'fastify-plugin';
import nats from "nats";

interface NATSPluginOptions {
    enableDefaultNATSServer?: boolean;
    drainOnClose?: boolean;
    natsOptions?: nats.ConnectionOptions;
}

export default fp<NATSPluginOptions>(async (fastify, options) => {
    const {
        drainOnClose = false,
        natsOptions = {}
    } = options

    const nc = await nats.connect(natsOptions)
    fastify.decorate('nats', nats)
    fastify.decorate('nc', nc)
    fastify.addHook('onClose', async () => {
        if (drainOnClose === true) {
            await nc.drain()
        } else {
            await nc.flush()
            await nc.close()
        }
    })
})

declare module 'fastify' {
    export interface FastifyInstance {
        nats: typeof nats;
        nc: nats.NatsConnection;
    }
}