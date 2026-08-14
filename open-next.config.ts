import { defineCloudflareConfig } from '@opennextjs/cloudflare'

export default {
  ...defineCloudflareConfig({}),
  buildCommand: 'node .yarn/releases/yarn-3.6.1.cjs build',
}
