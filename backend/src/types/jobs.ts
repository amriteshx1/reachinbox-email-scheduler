export type EmailSendJobData = {
  emailId: string;
  userId: string;
  senderId: string;
  campaignId: string;
  delayMs: number;
  hourlyLimit: number;
};

export type SearchIndexJobData = {
  emailId: string;
  op: "upsert" | "delete";
};

export type SlackNotifyJobData = {
  userId: string;
  senderId: string;
  senderLabel: string;
  hourBucket: string;
  senderLimit: number;
  globalLimit: number;
};
