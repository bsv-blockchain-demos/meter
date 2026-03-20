import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { compile } from 'runar-compiler'

const source = readFileSync(new URL('./YearBook.runar.ts', import.meta.url), 'utf-8')
const result = compile(source, { fileName: 'YearBook.runar.ts' })

if (!result.success) {
  const errors = result.diagnostics
    .filter((d: any) => d.severity === 'error')
    .map((d: any) => `  ${d.message} (${d.loc?.line}:${d.loc?.column})`)
    .join('\n')
  console.error(`Compilation failed:\n${errors}`)
  process.exit(1)
}

const artifact = result.artifact!
mkdirSync(new URL('../../artifacts', import.meta.url), { recursive: true })
writeFileSync(
  new URL('../../artifacts/YearBook.runar.json', import.meta.url),
  JSON.stringify(artifact, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2)
)
console.log(`Compiled: ${artifact.contractName}`)
