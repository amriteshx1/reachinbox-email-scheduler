import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { emailSendQueue, searchIndexQueue, slackNotifyQueue } from "./queues";

export function createBullBoardAdapter() {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  createBullBoard({
    queues: [
      new BullMQAdapter(emailSendQueue, { readOnlyMode: true }),
      new BullMQAdapter(searchIndexQueue, { readOnlyMode: true }),
      new BullMQAdapter(slackNotifyQueue, { readOnlyMode: true }),
    ],
    serverAdapter,
  });

  return serverAdapter;
}
