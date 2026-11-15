import { z } from 'zod';

const livekitConnectionSchema = z.object({
  url: z.url({ protocol: /^wss?$/ }).refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash;
  }),
  apiKey: z.string().trim().min(1),
  apiSecret: z.string().min(1),
});

/** Deployment-owned transport; no LiveKit administrator credentials reach clients. */
export const getLivekitConnection = () => {
  const result = livekitConnectionSchema.safeParse({
    url: process.env.LIVEKIT_URL,
    apiKey: process.env.LIVEKIT_API_KEY,
    apiSecret: process.env.LIVEKIT_API_SECRET,
  });
  return result.success ? result.data : undefined;
};
