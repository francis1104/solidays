#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const REPORT = '/Users/francis/Movies/xbox-gallery-web/process-report.json'
const BUCKET = 'solidays-gallery'

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

const accountId = requiredEnv('CLOUDFLARE_ACCOUNT_ID')
const client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: requiredEnv('AWS_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnv('AWS_SECRET_ACCESS_KEY'),
  },
})

async function putObject({ key, filePath, contentType }) {
  const body = await readFile(filePath)
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
        IfNoneMatch: '*',
      }),
    )
    return 'uploaded'
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode
    const name = error?.name || error?.Code
    if (status === 412 || name === 'PreconditionFailed') {
      return 'exists'
    }
    throw error
  }
}

const report = JSON.parse(await readFile(REPORT, 'utf8'))
let uploaded = 0
let exists = 0

for (const item of report) {
  for (const asset of [
    { key: `gaming/${item.id}.mp4`, filePath: item.video_path, contentType: 'video/mp4' },
    { key: `gaming/${item.id}.webp`, filePath: item.poster_path, contentType: 'image/webp' },
  ]) {
    const result = await putObject(asset)
    if (result === 'uploaded') uploaded += 1
    else exists += 1
    console.log(`${result} ${asset.key}`)
  }
}

console.log(`done uploaded=${uploaded} exists=${exists} dir=${path.dirname(fileURLToPath(import.meta.url))}`)
