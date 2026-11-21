/**
 * `npm run storage:check` (GĐ7.5): checks the Cloudflare R2 settings of .env.local end to end, with a tiny test
 * object in each bucket (removed at the end). Works before STORAGE_DRIVER is switched to r2. Prints ✔ / ✖ per step,
 * never a key, a secret or a signed link.
 *
 *  1. write + read back in both buckets          5. presigned upload (what the Admin's browser does)
 *  2. public object visible at R2_PUBLIC_BASE_URL 6. CORS: the browser at APP_URL may send that upload
 *  3. private object NOT visible there            7. listing
 *  4. one-minute download link (attachment)       8. clean-up
 */
import { randomBytes } from "node:crypto";
import { publicObjectUrl } from "../src/storage/r2-rules";
import { loadR2 } from "./storage-r2-env";

const { env, r2 } = loadR2("storage:check");
const id = randomBytes(8).toString("hex");
const keys = { public: `healthcheck/${id}.txt`, private: `healthcheck/${id}-private.txt`, upload: `healthcheck/${id}-upload.txt` };
const text = `asset-game storage check ${id}`;
const bytes = new TextEncoder().encode(text);
let failed = 0;

const ok = (msg: string) => console.log(`✔ ${msg}`);
const bad = (msg: string, hint?: string) => {
  failed++;
  console.log(`✖ ${msg}${hint ? `\n    → ${hint}` : ""}`);
};
const describe = (e: unknown) => {
  const x = e as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  return `${x?.name ?? "Error"}${x?.$metadata?.httpStatusCode ? ` (HTTP ${x.$metadata.httpStatusCode})` : ""}: ${x?.message ?? e}`;
};

async function step(name: string, fn: () => Promise<void>, hint?: string) {
  try {
    await fn();
  } catch (e) {
    bad(`${name}: ${describe(e)}`, hint);
  }
}

async function main() {
  console.log(`Kiểm tra R2: bucket công khai "${env.R2_PUBLIC_BUCKET}", bucket file bán "${env.R2_PRIVATE_BUCKET}", ảnh tại ${env.R2_PUBLIC_BASE_URL}`);
  const credsHint = "Kiểm tra R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY và quyền của API token (Object Read & Write cho cả 2 bucket).";

  await step("1. Ghi và đọc lại ở cả 2 bucket", async () => {
    await r2.put("public", keys.public, bytes);
    await r2.put("private", keys.private, bytes);
    const a = new TextDecoder().decode(await r2.read("public", keys.public));
    const b = new TextDecoder().decode(await r2.read("private", keys.private));
    if (a !== text || b !== text) throw new Error("nội dung đọc lại không khớp");
    ok("1. Ghi và đọc lại ở cả 2 bucket");
  }, credsHint);

  await step("2. Ảnh công khai mở được qua R2_PUBLIC_BASE_URL", async () => {
    const res = await fetch(publicObjectUrl(env.R2_PUBLIC_BASE_URL!, keys.public), { cache: "no-store" });
    const body = await res.text();
    if (res.status !== 200 || body !== text) throw new Error(`HTTP ${res.status}`);
    ok(`2. Ảnh công khai mở được qua ${env.R2_PUBLIC_BASE_URL} (Cache-Control: ${res.headers.get("cache-control") ?? "—"})`);
  }, "Gắn tên miền riêng (Settings → Custom Domains) hoặc bật Public Development URL (r2.dev) cho bucket công khai, rồi ghi đúng địa chỉ vào R2_PUBLIC_BASE_URL.");

  await step("3. File bán KHÔNG mở được qua địa chỉ công khai", async () => {
    const res = await fetch(publicObjectUrl(env.R2_PUBLIC_BASE_URL!, keys.private), { cache: "no-store" });
    if (res.status === 200) throw new Error("file của bucket file bán mở được công khai");
    ok(`3. File bán không mở được qua địa chỉ công khai (HTTP ${res.status})`);
  }, "R2_PUBLIC_BASE_URL đang trỏ vào bucket file bán? Tên miền / r2.dev chỉ được gắn vào bucket công khai; bucket file bán không bật truy cập công khai.");

  await step("4. Link tải 1 phút của file bán", async () => {
    const url = await r2.presignDownload(keys.private, "Bộ thử.txt");
    const res = await fetch(url, { cache: "no-store" });
    const body = await res.text();
    const disposition = res.headers.get("content-disposition") ?? "";
    if (res.status !== 200 || body !== text) throw new Error(`HTTP ${res.status}`);
    if (!disposition.startsWith("attachment")) throw new Error(`thiếu Content-Disposition: attachment (${disposition || "—"})`);
    ok("4. Link tải 1 phút của file bán: tải được, lưu thành file đính kèm");
  }, credsHint);

  let uploadUrl = "";
  let uploadHeaders: Record<string, string> = {};
  await step("5. Tải lên bằng link ký sẵn (như trình duyệt của Admin)", async () => {
    const target = await r2.presignUpload("public", keys.upload, bytes.byteLength);
    uploadUrl = target.url;
    uploadHeaders = target.headers;
    const res = await fetch(target.url, { method: "PUT", headers: target.headers, body: bytes });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const details = await r2.inspect("public", keys.upload, 16);
    if (!details || details.sizeBytes !== bytes.byteLength) throw new Error("không thấy file vừa tải lên");
    ok("5. Tải lên bằng link ký sẵn");
  }, credsHint);

  await step("6. CORS cho trình duyệt ở APP_URL", async () => {
    if (!uploadUrl) throw new Error("bỏ qua vì bước 5 lỗi");
    const origin = new URL(env.APP_URL).origin;
    for (const bucketKey of ["public", "private"] as const) {
      const target = bucketKey === "public" ? { url: uploadUrl, headers: uploadHeaders } : await r2.presignUpload("private", keys.private, 1);
      const res = await fetch(target.url, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "PUT",
          "Access-Control-Request-Headers": Object.keys(target.headers).join(",").toLowerCase(),
        },
      });
      const allowed = res.headers.get("access-control-allow-origin");
      if (!(res.ok && (allowed === origin || allowed === "*"))) throw new Error(`bucket ${bucketKey}: HTTP ${res.status}, Access-Control-Allow-Origin = ${allowed ?? "—"}`);
    }
    ok(`6. CORS: trình duyệt ở ${origin} được phép tải file lên cả 2 bucket`);
  }, `Thêm CORS policy cho CẢ 2 bucket (Settings → CORS Policy): AllowedOrigins ["${new URL(env.APP_URL).origin}"], AllowedMethods ["PUT"], AllowedHeaders ["Content-Type", "Cache-Control"]. Đổi CORS có thể mất khoảng 30 giây mới có hiệu lực.`);

  await step("7. Liệt kê object", async () => {
    const listed = await r2.list("public", "healthcheck");
    if (!listed.some((o) => o.key === keys.public)) throw new Error("không thấy object thử trong danh sách");
    ok("7. Liệt kê object");
  }, credsHint);

  await step("8. Dọn object thử", async () => {
    await r2.remove("public", keys.public);
    await r2.remove("public", keys.upload);
    await r2.remove("private", keys.private);
    if ((await r2.exists("public", keys.public)) || (await r2.exists("private", keys.private))) throw new Error("object thử vẫn còn");
    ok("8. Dọn object thử");
  }, credsHint);

  console.log(failed === 0 ? "\nR2 sẵn sàng." : `\n${failed} bước lỗi — xem gợi ý ở trên.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(describe(e));
  process.exit(1);
});
