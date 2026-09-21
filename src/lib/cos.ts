import "server-only";

import { createHash, createHmac, randomBytes } from "crypto";

// Tencent COS request signing ("q-sign-algorithm=sha1", see
// https://cloud.tencent.com/document/product/436/7778).
//
// Written out by hand rather than pulling in @aws-sdk/client-s3 or
// cos-nodejs-sdk-v5: the whole algorithm is the ~30 lines of HMAC-SHA1
// below, and either package would drag a dozen MB of transitive deps into
// a project whose entire dependency list is currently next + react +
// @vercel/postgres. Same reasoning as lib/ledgerAuth.ts -- Node's built-in
// crypto already has everything this needs.
//
// Why the bucket is in Hong Kong and not on Vercel Blob: video files are
// far too big to pass through a Vercel Function (4.5 MB request body cap),
// and Vercel/Cloudflare edge nodes are unusably slow from mainland China at
// peak hours. COS ap-hongkong needs no ICP filing and sits ~30-80ms away.

const REGION = process.env.COS_REGION ?? "ap-hongkong";
const BUCKET = process.env.COS_BUCKET ?? "";
const SECRET_ID = process.env.COS_SECRET_ID ?? "";
const SECRET_KEY = process.env.COS_SECRET_KEY ?? "";

export function isCosConfigured(): boolean {
  return Boolean(BUCKET && SECRET_ID && SECRET_KEY);
}

function cosHost(): string {
  return `${BUCKET}.cos.${REGION}.myqcloud.com`;
}

// Note that SignKey is fed to the second HMAC as the 40-character hex
// *text*, not as the 20 bytes it encodes. That is the one genuinely
// ambiguous step in this algorithm, and getting it wrong produces nothing
// more diagnostic than a SignatureDoesNotMatch from COS.
//
// Verified against the worked example in the Tencent docs (436/7778,
// "示例一：上传对象"): with their SignKey and StringToSign, this code
// reproduces 3b8851a11a569213c17ba8fa7dcf2abec6935172, while the doc
// prints ...c6931234. The first 36 hex digits match exactly and only the
// last four differ -- those are redacted in the doc the same way the
// example's SecretId and SecretKey are printed as ****. A real mismatch
// would differ in every digit, since SHA-1 avalanches.
function hmacSha1Hex(key: string, msg: string): string {
  return createHmac("sha1", key).update(msg).digest("hex");
}

function sha1Hex(msg: string): string {
  return createHash("sha1").update(msg).digest("hex");
}

export type CosMethod = "put" | "get" | "head" | "delete";

/**
 * Builds a pre-signed COS URL valid for `expiresInSec`.
 *
 * Neither headers nor query parameters are folded into the signature
 * (q-header-list and q-url-param-list are both left empty). That is
 * deliberate: browsers attach their own Content-Type (often with a charset
 * suffix) to a PUT, and any mismatch between what the browser sends and
 * what was signed fails the whole upload with SignatureDoesNotMatch. What
 * an uploader may do is instead constrained by the three things the server
 * *does* control -- it picks the object key, the URL is short-lived, and
 * the route handing it out is behind the upload password.
 */
export function presignUrl(
  method: CosMethod,
  key: string,
  expiresInSec: number
): string {
  const now = Math.floor(Date.now() / 1000);
  // Backdate the start by a minute so a slightly fast local clock doesn't
  // produce a URL COS considers not-yet-valid.
  const keyTime = `${now - 60};${now + expiresInSec}`;
  const signKey = hmacSha1Hex(SECRET_KEY, keyTime);
  // HttpString = method\npath\nquery\nheaders\n -- the two empty lines are
  // the (unsigned) query string and header list, and must still be present.
  const httpString = `${method}\n/${key}\n\n\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`;
  const signature = hmacSha1Hex(signKey, stringToSign);

  const auth = [
    "q-sign-algorithm=sha1",
    `q-ak=${SECRET_ID}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    "q-header-list=",
    "q-url-param-list=",
    `q-signature=${signature}`,
  ].join("&");

  return `https://${cosHost()}/${key}?${auth}`;
}

// Object keys are always minted here, never derived from the uploaded
// filename. Two reasons: a user-supplied name could contain "../" or
// collide with someone else's upload, and keeping every key inside
// [0-9a-f/.] sidesteps the question of whether COS signs the encoded or
// the raw pathname -- for these keys the two are identical.
export type ObjectExt = "mp4" | "webm" | "jpg";

export function newObjectKey(extension: ObjectExt): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `videos/${yyyy}/${mm}/${randomBytes(16).toString("hex")}.${extension}`;
}

// Keys that came back from the database are still checked before being
// signed, so a corrupted or hand-edited row can't be used to mint a URL
// pointing at some unrelated part of the bucket.
const SAFE_KEY = /^videos\/\d{4}\/\d{2}\/[0-9a-f]{32}\.(mp4|webm|jpg)$/;

export function isSafeObjectKey(key: string): boolean {
  return SAFE_KEY.test(key);
}

// How long a playback URL stays valid. Long enough that a page left open
// through a whole evening of browsing still plays, short enough that a URL
// pasted outside the team stops working the same night.
const PLAYBACK_TTL_SEC = 6 * 60 * 60;

export function playbackUrl(key: string): string | null {
  if (!isCosConfigured() || !isSafeObjectKey(key)) return null;
  return presignUrl("get", key, PLAYBACK_TTL_SEC);
}

// COS reports failures as an XML body with an error code in it. Pulling
// that code out is what turns "删除失败" into something the person setting
// this up can actually act on.
function parseCosErrorCode(body: string): string | null {
  return body.match(/<Code>([^<]+)<\/Code>/)?.[1] ?? null;
}

function describeCosError(status: number, code: string | null): string {
  switch (code) {
    case "NoSuchBucket":
      return "COS 里没有这个存储桶，检查 COS_BUCKET 和 COS_REGION 是否配对";
    case "SignatureDoesNotMatch":
      return "COS 签名不匹配，多半是 COS_SECRET_ID / COS_SECRET_KEY 填错了";
    case "AccessDenied":
      return "COS 拒绝访问，检查子账号权限里有没有 cos:DeleteObject";
    case "RequestTimeTooSkewed":
      return "服务器时钟和 COS 相差太大，签名被判过期";
    default:
      return code ? `COS 返回 ${status}（${code}）` : `COS 返回 ${status}`;
  }
}

// Deletes one object, reporting why if it didn't work. The caller treats a
// failure here as a failed delete overall, so the reason has to be specific
// enough to act on.
//
// Short TTL because this URL is minted and used in the same breath, never
// handed to a browser.
const DELETE_TTL_SEC = 60;

export type DeleteResult = { ok: true } | { ok: false; reason: string };

export async function deleteObject(key: string): Promise<DeleteResult> {
  if (!isCosConfigured()) {
    return { ok: false, reason: "视频存储没配好（缺 COS 环境变量）" };
  }
  if (!isSafeObjectKey(key)) {
    return { ok: false, reason: "文件标识不合法" };
  }
  try {
    const resp = await fetch(presignUrl("delete", key, DELETE_TTL_SEC), {
      method: "DELETE",
    });
    // COS answers a successful DELETE with 204, including when the object
    // was already gone -- DELETE is idempotent there.
    if (resp.ok) return { ok: true };

    const code = parseCosErrorCode(await resp.text().catch(() => ""));

    // A 404 is NOT automatically success. Only NoSuchKey means "the object
    // isn't there", which is the end state we want. A missing *bucket*
    // answers 404 too, and treating that as a successful delete would drop
    // the database row while the file sits untouched in whichever bucket
    // was actually meant -- silently, and with no way to find it again.
    if (resp.status === 404 && code === "NoSuchKey") return { ok: true };

    return { ok: false, reason: describeCosError(resp.status, code) };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? `连不上 COS：${err.message}` : "连不上 COS",
    };
  }
}
