import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

// Pass dotted config keys directly to Node, avoiding Windows shell argument parsing.
const result = spawnSync(process.execPath, [
  'node_modules/electron-builder/out/cli/cli.js', '--win', 'portable', '--x64',
  '-c.win.signAndEditExecutable=true', '-c.win.signExecutable=false',
], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
const output = (result.stdout || '') + (result.stderr || '')
process.stdout.write(output)
if (result.error) console.error(result.error.message)
if (result.status !== 0 && process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### Windows packaging diagnostics\n\n\`\`\`text\n${output.slice(-18000)}\n${result.error?.message || ''}\n\`\`\`\n`)
}
process.exit(result.status ?? 1)
