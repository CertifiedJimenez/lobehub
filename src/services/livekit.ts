import { lambdaClient } from '@/libs/trpc/client';

class LivekitService {
  createSession = () => lambdaClient.livekit.createSession.mutate();
  endSession = (roomName: string) => lambdaClient.livekit.endSession.mutate({ roomName });
}

export const livekitService = new LivekitService();
