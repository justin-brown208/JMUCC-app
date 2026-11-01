import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

export interface SendPayload {
  title: string;
  body: string;
  silent: boolean;
  roles: string[];
  waves?: string[];
  teamNumbers?: number[];
}

export interface SendResult {
  announcementId: string;
  recipientCount: number; // people matched
  tokenCount: number; // devices targeted
  delivered: number; // FCM successes
  failed: number; // FCM failures
}

// Compose the send. The heavy lifting (filtering, FCM fan-out)
// is all server-side in the sendNotification function.
export async function sendNotification(
  payload: SendPayload
): Promise<SendResult> {
  const call = httpsCallable<SendPayload, SendResult>(
    functions,
    "sendNotification"
  );
  const { data } = await call(payload);
  return data;
}
