import fp from 'fastify-plugin'
import fastifyCors, { FastifyCorsOptions } from '@fastify/cors'


export default fp<FastifyCorsOptions>(async (fastify, opts) => {
    fastify.register(fastifyCors, {
        origin: process.env.BETTER_AUTH_URL || "http://localhost:3000",
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "X-Requested-With"
        ],
        credentials: true,
        maxAge: 86400,
        ...opts
    });

})
