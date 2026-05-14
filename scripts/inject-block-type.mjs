import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const blockJsonPath = path.join(root, 'block', 'bitable-view.json')

const fromEnv = process.env.FEISHU_BLOCK_TYPE_ID?.trim()
const raw = fs.readFileSync(blockJsonPath, 'utf8')
const json = JSON.parse(raw)

if (fromEnv) {
  if (!fromEnv.startsWith('blk_')) {
    console.error('FEISHU_BLOCK_TYPE_ID 必须以 blk_ 开头（与开放平台「数据表视图」中的 BlockTypeID 一致）。')
    process.exit(1)
  }
  json.blockTypeID = fromEnv
  fs.writeFileSync(blockJsonPath, JSON.stringify(json, null, 2) + '\n', 'utf8')
  console.log('已写入 blockTypeID 到 block/bitable-view.json（来自环境变量）。')
} else {
  const id = json.blockTypeID?.trim()
  if (!id || !id.startsWith('blk_') || id.includes('REPLACE')) {
    console.error(
      [
        '缺少有效的 BlockTypeID。',
        '请任选其一：',
        '  1) 在 PowerShell 中设置环境变量后重试：',
        '     $env:FEISHU_BLOCK_TYPE_ID=\"blk_你的ID\"',
        '     npm run feishu:opdev:upload',
        '  2) 或直接在 block/bitable-view.json 中填写 blockTypeID（开放平台 → 应用 → 多维表格插件 → 数据表视图）。',
      ].join('\n'),
    )
    process.exit(1)
  }
}
