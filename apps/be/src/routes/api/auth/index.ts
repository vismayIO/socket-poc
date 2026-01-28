import type { FastifyPluginAsync } from "fastify";


const authRoute: FastifyPluginAsync = async (fastify): Promise<void> => {
    fastify.get("/", async (request, reply) => {
        reply.send({ message: "Auth API is running." });
    })

}

export default authRoute