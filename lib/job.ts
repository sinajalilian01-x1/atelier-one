import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

export interface Job {
  jobId: string;
  studioId: string;
  title: string;
  description: string;
  media: string;
  mediaHash: string;
  extra: string;
  priceYocto: string;
  createdAt: number;
}
const secret = () => process.env.JOB_SECRET || "dev-only-secret";
export function signJob(job: Job): string {
  const body = Buffer.from(JSON.stringify(job)).toString("base64url");
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}
export function verifyJob(token: string): Job {
  const [body, mac] = String(token || "").split(".");
  if (!body || !mac) throw new Error("Bad job token");
  const want = createHmac("sha256", secret()).update(body).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new Error("Job token signature mismatch");
  const job = JSON.parse(Buffer.from(body, "base64url").toString()) as Job;
  if (Date.now() - job.createdAt > 30 * 60_000) throw new Error("Job expired");
  return job;
}
