// Real S3-protocol integration test.
//
// Runs only when TD_S3_TEST_ENDPOINT points at a live S3-compatible server
// (moto in local verification, MinIO in CI). It exercises the same code path
// the upload routes use — no mocks.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const endpoint = process.env.TD_S3_TEST_ENDPOINT;
const bucket = process.env.TD_S3_TEST_BUCKET || `trustdrive-test-${Date.now()}`;
const suite = endpoint ? describe : describe.skip;

suite("S3-compatible storage", () => {
  let files: typeof import("../lib/server/files");
  let client: import("@aws-sdk/client-s3").S3Client;

  beforeAll(async () => {
    process.env.TD_STORAGE_PROVIDER = "s3";
    process.env.TD_S3_ENDPOINT = endpoint;
    process.env.TD_S3_BUCKET = bucket;
    process.env.TD_S3_REGION = process.env.TD_S3_TEST_REGION || "us-east-1";
    process.env.TD_S3_ACCESS_KEY_ID = process.env.TD_S3_TEST_ACCESS_KEY || "test";
    process.env.TD_S3_SECRET_ACCESS_KEY = process.env.TD_S3_TEST_SECRET_KEY || "test";
    process.env.TD_S3_FORCE_PATH_STYLE = "1";
    files = await import("../lib/server/files");
    const { S3Client, CreateBucketCommand } = await import("@aws-sdk/client-s3");
    client = new S3Client({
      region: process.env.TD_S3_REGION,
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.TD_S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.TD_S3_SECRET_ACCESS_KEY!,
      },
    });
    await client.send(new CreateBucketCommand({ Bucket: bucket })).catch((err) => {
      if (!/BucketAlreadyOwnedByYou|BucketAlreadyExists/i.test((err as Error).message)) throw err;
    });
  }, 60_000);

  afterAll(async () => {
    const { DeleteBucketCommand } = await import("@aws-sdk/client-s3");
    await client?.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => {});
    client?.destroy();
  });

  it("reports S3 as the active provider and a healthy bucket", async () => {
    expect(files.storageProvider()).toBe("s3");
    const health = await files.storageHealth();
    expect(health.provider).toBe("s3");
    expect(health.configured).toBe(true);
    expect(health.ok).toBe(true);
  });

  it("stores, reads and deletes a real PDF object", async () => {
    const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
    const stored = await files.saveUpload("documents/veh-1", pdf, files.MAX_DOC_BYTES);
    expect(stored.provider).toBe("s3");
    expect(stored.key).toMatch(/^documents\/veh-1\/.+\.pdf$/);
    expect(stored.sha256).toHaveLength(64);

    const read = await files.readUpload(stored.key);
    expect(read?.equals(pdf)).toBe(true);
    expect(await files.uploadExists(stored.key)).toBe(true);

    await files.deleteUpload(stored.key);
    expect(await files.uploadExists(stored.key)).toBe(false);
  }, 30_000);

  it("issues a presigned GET that serves the object without app credentials", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3L7wAAAABJRU5ErkJggg==",
      "base64"
    );
    const stored = await files.saveUpload("photos/veh-1", png, files.MAX_IMAGE_BYTES);
    const url = await files.getSignedFileUrl(stored.key, 60);
    expect(url).toContain(bucket);
    const res = await fetch(url!);
    expect(res.status).toBe(200);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.equals(png)).toBe(true);
    await files.deleteUpload(stored.key);
  }, 30_000);

  it("rejects a renamed executable before it reaches the bucket", async () => {
    await expect(
      files.saveUpload("documents/veh-1", Buffer.from("MZ\x90\x00not-a-pdf"), files.MAX_DOC_BYTES)
    ).rejects.toThrow("UNSUPPORTED_FILE_TYPE");
  });

  it("refuses path traversal keys", async () => {
    expect(await files.readUpload("../../etc/passwd")).toBeNull();
    await files.deleteUpload("../../etc/passwd");
  });

  it("materializes an object to a temporary file and cleans it up", async () => {
    const pdf = Buffer.from("%PDF-1.4\ntest\n%%EOF\n");
    const stored = await files.saveUpload("documents/veh-2", pdf, files.MAX_DOC_BYTES);
    const materialized = await files.materializeUpload(stored.key);
    expect(materialized).not.toBeNull();
    const { readFileSync, existsSync } = await import("node:fs");
    expect(readFileSync(materialized!.path).equals(pdf)).toBe(true);
    materialized!.cleanup();
    expect(existsSync(materialized!.path)).toBe(false);
    await files.deleteUpload(stored.key);
  }, 30_000);
});
