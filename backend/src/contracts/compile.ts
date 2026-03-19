import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { compile } from 'runar-compiler'

const source = readFileSync(new URL('./Counter.runar.ts', import.meta.url), 'utf-8')
const result = compile(source, { fileName: 'Counter.runar.ts' })

if (!result.success) {
  const errors = result.diagnostics
    .filter((d: any) => d.severity === 'error')
    .map((d: any) => `  ${d.message} (${d.loc?.line}:${d.loc?.column})`)
    .join('\n')
  console.error(`Compilation failed:\n${errors}`)
  process.exit(1)
}

mkdirSync(new URL('../../artifacts', import.meta.url), { recursive: true })
writeFileSync(
  new URL('../../artifacts/Counter.runar.json', import.meta.url),
  JSON.stringify(result.artifact, null, 2)
)
console.log(`Compiled: ${result.artifact.contractName}`)
