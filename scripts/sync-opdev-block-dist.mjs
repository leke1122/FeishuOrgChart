import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const dist = path.join(root, 'dist')
const target = path.join(root, 'block', 'bitable-view')

if (!fs.existsSync(dist)) {
  console.error('dist/ missing. Run npm run build first.')
  process.exit(1)
}

fs.rmSync(target, { recursive: true, force: true })
fs.mkdirSync(target, { recursive: true })

function copyRecursive(src, dest) {
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name)
    const to = path.join(dest, name)
    const st = fs.statSync(from)
    if (st.isDirectory()) {
      fs.mkdirSync(to, { recursive: true })
      copyRecursive(from, to)
    } else {
      fs.copyFileSync(from, to)
    }
  }
}

copyRecursive(dist, target)
console.log('Synced dist -> block/bitable-view')
